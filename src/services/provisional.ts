import {
  ArtifactRecordSchema,
  type ArtifactRecord,
  type ProjectManifest
} from "../domain/schema.js";
import {
  normalizePrivateArtifactPath,
  normalizeProjectArtifactPath,
  requirePersistedPrivateArtifactPath
} from "../domain/artifact-path.js";
import { canPromoteArtifact } from "../domain/policy.js";

export interface CreateProvisionalInput {
  id: string;
  kind: ArtifactRecord["kind"];
  path: string;
  question: string;
  rationale: string;
  assumptions: string[];
  blockers: string[];
  assetIds: string[];
  provider: NonNullable<ArtifactRecord["provider"]>;
  now?: Date;
}

function timestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

function requirePrivatePath(path: string): string {
  return normalizePrivateArtifactPath(path);
}

function requirePromotionPath(path: string, currentPath: string): string {
  const safePath = normalizeProjectArtifactPath(path);
  if (safePath === currentPath.replaceAll("\\", "/")) {
    throw new Error("Promotion requires a separate path and must preserve the provisional source.");
  }
  if (safePath.toLowerCase().startsWith(".creative-preproduction/private/")) {
    throw new Error("Promoted artifacts must be written outside private workspace.");
  }
  return safePath;
}

export function createProvisionalArtifact(input: CreateProvisionalInput): ArtifactRecord {
  requireNonEmpty(input.question, "Creative question");
  requireNonEmpty(input.rationale, "Artifact rationale");
  const now = timestamp(input.now);
  return ArtifactRecordSchema.parse({
    id: input.id,
    kind: input.kind,
    version: 1,
    path: requirePrivatePath(input.path),
    status: "provisional",
    visibility: "private",
    question: input.question,
    rationale: input.rationale,
    assumptions: [...input.assumptions],
    blockers: [...input.blockers],
    assetIds: [...input.assetIds],
    provider: input.provider,
    createdAt: now,
    updatedAt: now
  });
}

export function promoteProvisionalArtifact(
  current: ArtifactRecord,
  manifest: ProjectManifest,
  input: { path: string; rationale: string; now?: Date }
): ArtifactRecord {
  const validated = ArtifactRecordSchema.parse(current);
  if (validated.status !== "provisional") {
    throw new Error("Only provisional artifacts can be promoted.");
  }
  requirePersistedPrivateArtifactPath(validated.path);
  requireNonEmpty(input.rationale, "Artifact rationale");
  const path = requirePromotionPath(input.path, validated.path);
  if (manifest.artifacts.some((artifact) =>
    artifact.id === validated.id && artifact.version === validated.version + 1
  )) {
    throw new Error(`Artifact ${validated.id} version ${validated.version + 1} already exists.`);
  }
  for (const artifact of manifest.artifacts) {
    let artifactPath: string;
    try {
      artifactPath = normalizeProjectArtifactPath(artifact.path);
    } catch (error: unknown) {
      throw new Error(`Artifact ${artifact.id} v${artifact.version} has an unsafe path.`, { cause: error });
    }
    if (artifactPath === path) {
      throw new Error(`Artifact destination path ${path} already exists.`);
    }
  }
  for (const assetId of validated.assetIds) {
    const assets = manifest.assets.filter((candidate) => candidate.id === assetId);
    if (assets.length === 0) {
      throw new Error(`Referenced asset ${assetId} does not exist in the project manifest.`);
    }
    if (assets.length > 1) {
      throw new Error(`Referenced asset ${assetId} is ambiguous in the project manifest.`);
    }
  }
  const policy = canPromoteArtifact(manifest, validated);
  if (!policy.allowed) {
    throw new Error(`Cannot promote artifact: ${policy.reasons.join(" ")}`);
  }

  const { question: _question, assumptions: _assumptions, blockers: _blockers, ...base } = validated;
  const now = timestamp(input.now);
  return ArtifactRecordSchema.parse({
    ...base,
    version: validated.version + 1,
    parentVersion: validated.version,
    path,
    status: "draft",
    visibility: "project",
    rationale: input.rationale,
    assetIds: [...validated.assetIds],
    createdAt: now,
    updatedAt: now
  });
}
