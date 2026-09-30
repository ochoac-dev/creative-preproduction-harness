import type { ApprovalRecord, ArtifactRecord, ProjectManifest } from "../domain/schema.js";

export interface CreateArtifactInput {
  id: string;
  kind: ArtifactRecord["kind"];
  path: string;
  rationale: string;
  now?: Date;
}

export interface ReviseArtifactInput {
  path: string;
  rationale: string;
  now?: Date;
}

export interface RecordApprovalInput {
  artifact: ArtifactRecord;
  tier: ApprovalRecord["tier"];
  decision: ApprovalRecord["decision"];
  reviewer: string;
  reviewerId?: string;
  reason: string;
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

function approvalId(input: RecordApprovalInput, createdAt: string): string {
  const reviewer = input.reviewer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    input.artifact.id,
    `v${input.artifact.version}`,
    input.tier,
    input.decision,
    createdAt,
    reviewer
  ].join("-");
}

export function createArtifact(input: CreateArtifactInput): ArtifactRecord {
  requireNonEmpty(input.rationale, "Artifact rationale");
  const now = timestamp(input.now);
  return {
    id: input.id,
    kind: input.kind,
    version: 1,
    path: input.path,
    status: "draft",
    visibility: "project",
    assetIds: [],
    rationale: input.rationale,
    createdAt: now,
    updatedAt: now
  };
}

export function reviseArtifact(
  current: ArtifactRecord,
  input: ReviseArtifactInput
): ArtifactRecord {
  requireNonEmpty(input.rationale, "Artifact rationale");
  if (input.path === current.path) {
    throw new Error("Artifact revisions require a different path.");
  }
  const now = timestamp(input.now);
  return {
    ...current,
    version: current.version + 1,
    path: input.path,
    status: "draft",
    rationale: input.rationale,
    parentVersion: current.version,
    createdAt: now,
    updatedAt: now
  };
}

function artifactStatusFor(decision: ApprovalRecord["decision"]): ArtifactRecord["status"] {
  if (decision === "approved") {
    return "approved";
  }
  if (decision === "approved-with-conditions") {
    return "in-review";
  }
  return "draft";
}

export function recordApproval(input: RecordApprovalInput): {
  artifact: ArtifactRecord;
  approval: ApprovalRecord;
} {
  if (input.artifact.status === "provisional") {
    throw new Error("Provisional artifacts cannot be approved; promote the work to a draft first.");
  }
  requireNonEmpty(input.reviewer, "Approval reviewer");
  requireNonEmpty(input.reason, "Approval reason");
  const createdAt = timestamp(input.now);
  return {
    artifact: {
      ...input.artifact,
      status: artifactStatusFor(input.decision),
      updatedAt: createdAt
    },
    approval: {
      id: approvalId(input, createdAt),
      artifactId: input.artifact.id,
      artifactVersion: input.artifact.version,
      tier: input.tier,
      decision: input.decision,
      reviewer: input.reviewer,
      ...(input.reviewerId === undefined ? {} : { reviewerId: input.reviewerId }),
      reason: input.reason,
      createdAt
    }
  };
}

export interface ApplyReviewDecisionInput {
  artifactId: string;
  artifactVersion: number;
  tier: ApprovalRecord["tier"];
  decision: ApprovalRecord["decision"];
  reviewer: string;
  reviewerId?: string;
  reason: string;
  now?: Date;
}

export function applyReviewDecision(
  manifest: ProjectManifest,
  input: ApplyReviewDecisionInput
): ProjectManifest {
  const artifact = manifest.artifacts.find((candidate) =>
    candidate.id === input.artifactId && candidate.version === input.artifactVersion
  );
  if (artifact === undefined) {
    throw new Error(`Artifact ${input.artifactId} v${input.artifactVersion} does not exist.`);
  }
  const recorded = recordApproval({
    artifact,
    tier: input.tier,
    decision: input.decision,
    reviewer: input.reviewer,
    ...(input.reviewerId === undefined ? {} : { reviewerId: input.reviewerId }),
    reason: input.reason,
    ...(input.now === undefined ? {} : { now: input.now })
  });
  return {
    ...manifest,
    artifacts: artifact.status === "approved"
      ? [...manifest.artifacts]
      : manifest.artifacts.map((candidate) =>
          candidate.id === artifact.id && candidate.version === artifact.version
            ? recorded.artifact
            : candidate
        ),
    approvals: [...manifest.approvals, recorded.approval]
  };
}
