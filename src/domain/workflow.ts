import type { ApprovalRecord, ArtifactRecord, ProjectManifest, Stage } from "./schema.js";
import type { ProjectStore } from "../storage/project-store.js";
import { effectiveArtifactDecision, evaluateHandoffPolicy } from "./policy.js";

export type TransitionResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

export const stages = [
  "brief",
  "research",
  "territories",
  "visual-language",
  "exploration",
  "review",
  "handoff"
] as const satisfies readonly Stage[];

const approvalTierRank: Record<ApprovalRecord["tier"], number> = {
  self: 0,
  peer: 1,
  "creative-lead": 2,
  stakeholder: 3
};

function hasMatchingApproval(
  manifest: ProjectManifest,
  artifact: ArtifactRecord,
  minimumTier: ApprovalRecord["tier"] = "self"
): boolean {
  if (artifact.status !== "approved") {
    return false;
  }

  const effectiveApproval = effectiveArtifactDecision(manifest, artifact);

  return effectiveApproval?.decision === "approved"
    && approvalTierRank[effectiveApproval.tier] >= approvalTierRank[minimumTier];
}

function latestArtifacts(manifest: ProjectManifest): ArtifactRecord[] {
  const latestById = new Map<string, ArtifactRecord>();
  for (const candidate of manifest.artifacts) {
    const current = latestById.get(candidate.id);
    if (current === undefined || candidate.version > current.version) {
      latestById.set(candidate.id, candidate);
    }
  }
  return [...latestById.values()];
}

function latestArtifactsOfKind(
  manifest: ProjectManifest,
  kind: ArtifactRecord["kind"]
): ArtifactRecord[] {
  return latestArtifacts(manifest).filter((candidate) => candidate.kind === kind);
}

function approvedArtifacts(manifest: ProjectManifest, kind: ArtifactRecord["kind"]): ArtifactRecord[] {
  return latestArtifactsOfKind(manifest, kind)
    .filter((candidate) => hasMatchingApproval(manifest, candidate));
}

function evaluateAdjacentForwardTransition(manifest: ProjectManifest, target: Stage): string[] {
  const reasons: string[] = [];

  if (manifest.stage === "brief" && target === "research") {
    if (approvedArtifacts(manifest, "creative-brief").length === 0) {
      reasons.push("An approved creative-brief artifact is required.");
    }
  } else if (manifest.stage === "research" && target === "territories") {
    if (approvedArtifacts(manifest, "research-board").length === 0) {
      reasons.push("An approved research-board artifact is required.");
    }
    if (manifest.references.length === 0) {
      reasons.push("At least one reference is required.");
    }
  } else if (manifest.stage === "territories" && target === "visual-language") {
    const territories = latestArtifactsOfKind(manifest, "creative-territory")
      .filter((candidate) => candidate.status !== "superseded"
        && candidate.status !== "provisional" && candidate.visibility === "project");
    if (territories.length < 2) {
      reasons.push("At least two creative-territory artifacts are required.");
    }
    if (!territories.some((candidate) => hasMatchingApproval(manifest, candidate))) {
      reasons.push("At least one creative-territory artifact must be approved.");
    }
  } else if (manifest.stage === "visual-language" && target === "exploration") {
    if (approvedArtifacts(manifest, "visual-language").length === 0) {
      reasons.push("An approved visual-language artifact is required.");
    }
  } else if (manifest.stage === "exploration" && target === "review") {
    const hasReviewableStudy = latestArtifactsOfKind(manifest, "composition-study").some((candidate) =>
      candidate.status === "in-review" || candidate.status === "approved"
    );
    if (!hasReviewableStudy) {
      reasons.push("A composition-study artifact in review or approved is required.");
    }
  } else if (manifest.stage === "review" && target === "handoff") {
    const handoffs = approvedArtifacts(manifest, "implementation-handoff");
    if (handoffs.length === 0) {
      reasons.push("An approved implementation-handoff artifact is required.");
    } else {
      const minimumTier = manifest.project.kind === "new-site" ? "creative-lead" : "peer";
      const hasRequiredApproval = handoffs.some((candidate) =>
        hasMatchingApproval(manifest, candidate, minimumTier)
      );
      if (!hasRequiredApproval) {
        const requirement = manifest.project.kind === "new-site"
          ? "creative-lead or stakeholder"
          : "peer or higher";
        reasons.push(`The approved implementation-handoff requires ${requirement} approval.`);
      }
    }
    reasons.push(...evaluateHandoffPolicy(manifest).reasons);
  }

  return reasons;
}

export function canTransition(manifest: ProjectManifest, target: Stage): TransitionResult {
  const currentIndex = stages.indexOf(manifest.stage);
  const targetIndex = stages.indexOf(target);

  if (targetIndex < currentIndex) {
    return { allowed: true, reasons: [] };
  }
  if (targetIndex === currentIndex) {
    return {
      allowed: false,
      reasons: [`Project is already at stage ${manifest.stage}.`]
    };
  }
  if (targetIndex > currentIndex + 1) {
    return {
      allowed: false,
      reasons: [`Cannot skip forward from ${manifest.stage} to ${target}.`]
    };
  }

  const reasons = evaluateAdjacentForwardTransition(manifest, target);
  return reasons.length === 0
    ? { allowed: true, reasons: [] }
    : { allowed: false, reasons };
}

export async function transitionProject(
  store: ProjectStore,
  target: Stage,
  now: Date = new Date()
): Promise<ProjectManifest> {
  const manifest = await store.load();
  const result = canTransition(manifest, target);
  if (!result.allowed) {
    throw new Error(
      `Cannot transition from ${manifest.stage} to ${target}: ${result.reasons.join(" ")}`
    );
  }

  const transitioned: ProjectManifest = {
    ...manifest,
    stage: target,
    updatedAt: now.toISOString()
  };
  await store.save(transitioned);
  return transitioned;
}
