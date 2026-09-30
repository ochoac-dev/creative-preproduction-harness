import { normalizeProjectArtifactPath } from "../domain/artifact-path.js";
import { canPromoteArtifact } from "../domain/policy.js";
import {
  ArtifactKindSchema,
  ArtifactRecordSchema,
  ReferenceRecordSchema,
  StageSchema,
  type ArtifactKind,
  type ArtifactRecord,
  type ProjectManifest,
  type ReferenceRecord,
  type Stage
} from "../domain/schema.js";
import { canTransition, stages, type TransitionResult } from "../domain/workflow.js";
import { assertManifestProjectArtifactFile, assertUnusedProjectArtifactFile } from "../storage/artifact-file.js";
import type { ProjectStore } from "../storage/project-store.js";
import { createArtifact, reviseArtifact } from "./artifacts.js";
import { assertManagedAssetLocation } from "./assets.js";
import { validateProject } from "./validation.js";

export interface AddProjectArtifactInput {
  id: string;
  kind: ArtifactKind;
  path: string;
  rationale: string;
  assetIds?: string[];
}

export interface ReviseProjectArtifactInput {
  id: string;
  version: number;
  path: string;
  rationale: string;
  assetIds?: string[];
}

export interface ArtifactVersionInput {
  id: string;
  version: number;
}

function requireId(id: string): string {
  if (id.trim().length === 0) throw new Error("Artifact ID must not be empty.");
  return id.trim();
}

function latestArtifact(manifest: ProjectManifest, input: ArtifactVersionInput): ArtifactRecord {
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new Error("Artifact version must be a positive integer.");
  }
  const id = requireId(input.id);
  const current = manifest.artifacts.filter((artifact) => artifact.id === id)
    .sort((left, right) => right.version - left.version)[0];
  if (current === undefined) throw new Error(`Artifact ${id} does not exist.`);
  if (current.version !== input.version) {
    throw new Error(`Select the latest version of artifact ${id}: v${current.version}.`);
  }
  return current;
}

async function assertProjectAssets(root: string, manifest: ProjectManifest, artifact: ArtifactRecord): Promise<void> {
  for (const id of artifact.assetIds) {
    if (!manifest.assets.some((asset) => asset.id === id)) {
      throw new Error(`Artifact ${artifact.id} v${artifact.version} references missing asset ${id}.`);
    }
  }
  const result = canPromoteArtifact(manifest, artifact);
  if (!result.allowed) throw new Error(result.reasons.join(" "));
  for (const id of artifact.assetIds) {
    const asset = manifest.assets.find((candidate) => candidate.id === id)!;
    if (asset.storage.kind === "managed") {
      await assertManagedAssetLocation(root, asset.storage.path);
      await assertManifestProjectArtifactFile(root, manifest, asset.storage.path);
    }
  }
}

async function mutateProject(
  store: ProjectStore,
  mutation: (manifest: ProjectManifest) => ProjectManifest | Promise<ProjectManifest>
): Promise<ProjectManifest> {
  let saved: ProjectManifest | undefined;
  await store.mutate(async (manifest) => {
    saved = await mutation(manifest);
    return saved;
  });
  return saved!;
}

export async function addProjectArtifact(store: ProjectStore, input: AddProjectArtifactInput): Promise<ProjectManifest> {
  const id = requireId(input.id);
  const kind = ArtifactKindSchema.parse(input.kind);
  const path = normalizeProjectArtifactPath(input.path);
  return mutateProject(store, async (manifest) => {
    if (manifest.artifacts.some((artifact) => artifact.id === id)) {
      throw new Error(`Artifact ${id} already exists; revise its latest version instead.`);
    }
    const artifact = ArtifactRecordSchema.parse({
      ...createArtifact({ id, kind, path, rationale: input.rationale }),
      assetIds: [...new Set(input.assetIds ?? [])]
    });
    await assertProjectAssets(store.root, manifest, artifact);
    await assertUnusedProjectArtifactFile(store.root, manifest, path);
    return { ...manifest, artifacts: [...manifest.artifacts, artifact], updatedAt: artifact.updatedAt };
  });
}

export async function reviseProjectArtifact(store: ProjectStore, input: ReviseProjectArtifactInput): Promise<ProjectManifest> {
  const path = normalizeProjectArtifactPath(input.path);
  return mutateProject(store, async (manifest) => {
    const current = latestArtifact(manifest, input);
    if (current.visibility !== "project" || current.status === "provisional") {
      throw new Error("Private provisional work must be promoted before creating a project revision.");
    }
    const artifact = ArtifactRecordSchema.parse({
      ...reviseArtifact(current, { path, rationale: input.rationale }),
      assetIds: [...new Set(input.assetIds ?? current.assetIds)]
    });
    await assertProjectAssets(store.root, manifest, artifact);
    await assertUnusedProjectArtifactFile(store.root, manifest, path);
    return { ...manifest, artifacts: [...manifest.artifacts, artifact], updatedAt: artifact.updatedAt };
  });
}

export async function submitProjectArtifact(store: ProjectStore, input: ArtifactVersionInput): Promise<ProjectManifest> {
  return mutateProject(store, async (manifest) => {
    const artifact = latestArtifact(manifest, input);
    if (artifact.status !== "draft" || artifact.visibility !== "project") {
      throw new Error("Only a project-visible draft can be submitted for review.");
    }
    await assertProjectAssets(store.root, manifest, artifact);
    await assertUnusedProjectArtifactFile(store.root, manifest, artifact.path, artifact);
    const updatedAt = new Date().toISOString();
    return {
      ...manifest,
      artifacts: manifest.artifacts.map((candidate) => candidate.id === artifact.id && candidate.version === artifact.version
        ? { ...candidate, status: "in-review", updatedAt }
        : candidate),
      updatedAt
    };
  });
}

export async function addProjectReference(store: ProjectStore, input: ReferenceRecord): Promise<ProjectManifest> {
  const reference = ReferenceRecordSchema.parse(Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.trim()])
  ));
  return mutateProject(store, (manifest) => {
    if (manifest.references.some((candidate) => candidate.id === reference.id)) {
      throw new Error(`Reference ${reference.id} already exists.`);
    }
    return { ...manifest, references: [...manifest.references, reference], updatedAt: new Date().toISOString() };
  });
}

async function evaluateStage(root: string, manifest: ProjectManifest, target: Stage): Promise<TransitionResult> {
  if (stages.indexOf(target) !== stages.indexOf(manifest.stage) + 1) {
    return { allowed: false, reasons: [`Stage changes must move one adjacent stage forward from ${manifest.stage}.`] };
  }
  const transition = canTransition(manifest, target);
  const diagnostics = await validateProject(root, manifest);
  const reasons = [
    ...transition.reasons,
    ...diagnostics.filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `${diagnostic.code} ${diagnostic.subjectId}: ${diagnostic.message}`)
  ];
  return reasons.length === 0 ? { allowed: true, reasons: [] } : { allowed: false, reasons };
}

export async function checkProjectStage(store: ProjectStore, to: Stage): Promise<TransitionResult> {
  const target = StageSchema.parse(to);
  return evaluateStage(store.root, await store.load(), target);
}

export async function advanceProjectStage(store: ProjectStore, to: Stage): Promise<ProjectManifest> {
  const target = StageSchema.parse(to);
  return mutateProject(store, async (manifest) => {
    const transition = await evaluateStage(store.root, manifest, target);
    if (!transition.allowed) {
      throw new Error(`Cannot advance from ${manifest.stage} to ${target}: ${transition.reasons.join(" ")}`);
    }
    return { ...manifest, stage: target, updatedAt: new Date().toISOString() };
  });
}
