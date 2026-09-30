import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { describeNextCreativeAction, determinePostures } from "../creative-direction/coordinator.js";
import { buildQuestionPacket } from "../creative-direction/questions.js";
import { normalizeProjectArtifactPath } from "../domain/artifact-path.js";
import { describeUnknownRightsRestriction, effectiveArtifactDecision, evaluateManifestPolicy } from "../domain/policy.js";
import type { ArtifactKind, ArtifactRecord, ProjectManifest } from "../domain/schema.js";
import { renderAssetDossier } from "../services/asset-dossier.js";
import { assertUnusedProjectArtifactFile } from "../storage/artifact-file.js";
import type { CreativeDirectionContext } from "./types.js";

type SharedContext = Omit<CreativeDirectionContext, "host">;

const approvedArtifactKinds: ArtifactKind[] = [
  "identity-thesis",
  "creative-territory",
  "visual-language"
];

const operatingRules = [
  "Ask focused questions from the unresolved question packet before filling gaps with assumptions.",
  "Preserve human authority and declare meaningful role changes before acting differently.",
  "Act as a coach: help people make informed creative decisions through focused questions.",
  "Act as a collaborator: keep the creative lead and decision owners in control of direction.",
  "Act as a maker: create only within supplied-asset permissions and challenge generic patterns with evidence.",
  "Private and provisional work remains private and cannot serve as project-visible, approved, or handoff evidence.",
  "Only an explicit creative-preproduction review action creates approval.",
  "Use public creative-preproduction harness commands; do not edit the manifest directly."
];

function compareArtifacts(left: ArtifactRecord, right: ArtifactRecord): number {
  if (left.version !== right.version) {
    return right.version - left.version;
  }
  return compareCodePoints(left.id, right.id);
}

function compareCodePoints(left: string, right: string): number {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  for (;;) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      return leftNext.done === rightNext.done ? 0 : leftNext.done ? -1 : 1;
    }
    const leftCodePoint = leftNext.value.codePointAt(0)!;
    const rightCodePoint = rightNext.value.codePointAt(0)!;
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }
}

function latestApprovedArtifact(
  manifest: ProjectManifest,
  kind: ArtifactKind,
  blockers: string[]
): ArtifactRecord | undefined {
  const candidates = manifest.artifacts
    .filter((artifact) => artifact.kind === kind && artifact.status === "approved")
    .sort(compareArtifacts);
  for (const artifact of candidates) {
    const decision = effectiveArtifactDecision(manifest, artifact);
    if (decision?.decision === "approved") return artifact;
    blockers.push(`Artifact ${artifact.id} v${artifact.version} cannot supply approved context: ${
      decision === undefined ? "no exact-version approval" : `${decision.decision}: ${decision.reason}`
    }.`);
  }
  return undefined;
}

function resolveInsideRoot(root: string, path: string): string | undefined {
  let normalized: string;
  try {
    normalized = normalizeProjectArtifactPath(path);
  } catch {
    return undefined;
  }
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, normalized);
  const relativePath = relative(resolvedRoot, candidate);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`)
    && !relativePath.startsWith("../") && !isAbsolute(relativePath)
    ? candidate
    : undefined;
}

function isPrivateWorkspacePath(path: string): boolean {
  return path === ".creative-preproduction/private" || path.startsWith(".creative-preproduction/private/");
}

function isWithin(root: string, candidate: string): boolean {
  const comparableRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const comparableCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const relativePath = relative(comparableRoot, comparableCandidate);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !relativePath.startsWith("../") &&
    !isAbsolute(relativePath)
  );
}

async function realpathIfPresent(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error: unknown) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return undefined;
    }
    throw error;
  }
}

async function readApprovedArtifact(
  root: string,
  manifest: ProjectManifest,
  artifact: ArtifactRecord,
  blockers: string[]
): Promise<string | undefined> {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeProjectArtifactPath(artifact.path);
  } catch {
    blockers.push(
      `Approved ${artifact.kind} ${artifact.id} v${artifact.version} path does not resolve inside the project root.`
    );
    return undefined;
  }
  if (artifact.visibility !== "project" || isPrivateWorkspacePath(normalizedPath)) {
    blockers.push(
      `Approved ${artifact.kind} ${artifact.id} v${artifact.version} is private or stored in the private workspace and cannot be included in agent context.`
    );
    return undefined;
  }
  const path = resolveInsideRoot(root, normalizedPath);
  if (path === undefined) {
    blockers.push(
      `Approved ${artifact.kind} ${artifact.id} v${artifact.version} path does not resolve inside the project root.`
    );
    return undefined;
  }
  try {
    const [canonicalRoot, canonicalPath, canonicalPrivateRoot] = await Promise.all([
      realpath(resolve(root)),
      realpath(path),
      realpathIfPresent(resolve(root, ".creative-preproduction", "private"))
    ]);
    if (!isWithin(canonicalRoot, canonicalPath)) {
      blockers.push(
        `Approved ${artifact.kind} ${artifact.id} v${artifact.version} canonical path does not resolve inside the project root.`
      );
      return undefined;
    }
    if (canonicalPrivateRoot !== undefined && isWithin(canonicalPrivateRoot, canonicalPath)) {
      blockers.push(
        `Approved ${artifact.kind} ${artifact.id} v${artifact.version} is private or stored in the private workspace and cannot be included in agent context.`
      );
      return undefined;
    }
    await assertUnusedProjectArtifactFile(root, manifest, normalizedPath, artifact);
    return await readFile(canonicalPath, "utf8");
  } catch (error: unknown) {
    blockers.push(
      `Approved ${artifact.kind} ${artifact.id} v${artifact.version} file is unsafe, missing, or unreadable: ${(error as Error).message}`
    );
    return undefined;
  }
}

function artifactLabel(artifact: ArtifactRecord): string {
  return `${artifact.kind} (${artifact.id} v${artifact.version})`;
}

export async function buildSharedCreativeDirectionContext(input: {
  root: string;
  manifest: ProjectManifest;
}): Promise<SharedContext> {
  const { manifest, root } = input;
  const blockers = evaluateManifestPolicy(manifest).map((issue) => issue.message);
  const approvedContext: string[] = [];

  for (const kind of approvedArtifactKinds) {
    const artifact = latestApprovedArtifact(manifest, kind, blockers);
    if (artifact === undefined) {
      continue;
    }
    const contents = await readApprovedArtifact(root, manifest, artifact, blockers);
    if (contents !== undefined) {
      approvedContext.push(`${artifactLabel(artifact)}\n\n${contents}`);
    }
  }

  const packet = buildQuestionPacket(manifest);
  const unknownRightsRestrictions = [...manifest.assets]
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map(describeUnknownRightsRestriction)
    .filter((restriction): restriction is string => restriction !== undefined);
  return {
    projectName: manifest.project.name,
    stage: manifest.stage,
    postures: determinePostures(manifest),
    instructions: [...operatingRules],
    approvedContext,
    suppliedAssets: manifest.assets.length === 0
      ? []
      : [renderAssetDossier(manifest).trimEnd(), ...unknownRightsRestrictions],
    feedback: [...manifest.feedback]
      .sort((left, right) => compareCodePoints(left.id, right.id))
      .map((feedback) => ({ original: feedback.originalText, interpretation: feedback.interpretation })),
    questions: packet.items,
    blockers,
    nextAction: describeNextCreativeAction(manifest)
  };
}

function section(heading: string, contents: string[]): string {
  return [heading, "", ...(contents.length === 0 ? ["- None"] : contents)].join("\n");
}

export function renderCreativeDirectionContext(
  context: CreativeDirectionContext,
  hostName: string
): string {
  return [
    `Creative Preproduction Context (${hostName})`,
    `Project: ${context.projectName}\nStage: ${context.stage}`,
    section("Current Posture", [`- ${context.postures.join(", ") || "lead"}`]),
    section("Operating Rules", context.instructions.map((instruction) => `- ${instruction}`)),
    section("Approved Context", context.approvedContext),
    section("Supplied Assets and Permissions", context.suppliedAssets),
    section("Imported Feedback", context.feedback.map((feedback) =>
      `- Original: ${feedback.original}\n  Interpretation: ${feedback.interpretation}`
    )),
    section("Unresolved Questions", context.questions.map((question) => `- ${question.source}: ${question.question}`)),
    section("Blocking Conditions", context.blockers.map((blocker) => `- ${blocker}`)),
    section("Next Creative Action", [context.nextAction])
  ].join("\n\n").concat("\n");
}
