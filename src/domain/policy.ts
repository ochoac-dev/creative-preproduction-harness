import type {
  ApprovalRecord,
  ArtifactRecord,
  AssetRecord,
  DecisionOwnerRecord,
  FeedbackRecord,
  ProjectManifest
} from "./schema.js";

export type PolicyResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

export type CreativeProvider = "local-html-svg" | "figma" | "manual";

const DEFAULT_LOCAL_PROVIDER: CreativeProvider = "local-html-svg";

export type ManifestPolicyIssueCode =
  | "asset-reference-missing"
  | "artifact-reference-missing"
  | "feedback-reference-missing"
  | "handoff-artifact-unapproved"
  | "asset-private-reference"
  | "asset-rights-blocked"
  | "asset-provider-blocked"
  | "feedback-condition-open"
  | "decision-owner-approval-missing"
  | "provisional-in-handoff";

export interface ManifestPolicyIssue {
  code: ManifestPolicyIssueCode;
  subjectId: string;
  message: string;
}

function result(reasons: string[]): PolicyResult {
  return reasons.length === 0
    ? { allowed: true, reasons: [] }
    : { allowed: false, reasons };
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function latestArtifacts(manifest: ProjectManifest): ArtifactRecord[] {
  const latest = new Map<string, ArtifactRecord>();
  for (const artifact of manifest.artifacts) {
    const current = latest.get(artifact.id);
    if (current === undefined || artifact.version > current.version) {
      latest.set(artifact.id, artifact);
    }
  }
  return [...latest.values()].sort(compareById);
}

export function effectiveArtifactDecision(
  manifest: ProjectManifest,
  artifact: Pick<ArtifactRecord, "id" | "version">
): ApprovalRecord | undefined {
  let effective: ApprovalRecord | undefined;
  for (const approval of manifest.approvals) {
    if (approval.artifactId !== artifact.id || approval.artifactVersion !== artifact.version) {
      continue;
    }
    // Equal instants are resolved by the later record in manifest order.
    if (effective === undefined || Date.parse(approval.createdAt) >= Date.parse(effective.createdAt)) {
      effective = approval;
    }
  }
  return effective;
}

function ownerFor(
  manifest: ProjectManifest,
  area: DecisionOwnerRecord["area"]
): DecisionOwnerRecord | undefined {
  return manifest.decisionOwners.find((owner) => owner.area === area);
}

export function canUseAssetWithProvider(
  asset: AssetRecord,
  provider: CreativeProvider
): PolicyResult {
  if (asset.rightsStatus === "unknown") {
    return provider === "local-html-svg"
      ? { allowed: true, reasons: [] }
      : {
          allowed: false,
          reasons: [`Asset ${asset.id} has unknown rights and is limited to private local HTML/SVG studies.`]
        };
  }

  const reasons: string[] = [];
  if (!asset.providerScopes.includes(provider)) {
    reasons.push(`Asset ${asset.id} is not permitted for provider ${provider}.`);
  }
  if (asset.storage.kind === "private" && provider !== "local-html-svg") {
    reasons.push(`Asset ${asset.id} uses private storage and cannot be sent to provider ${provider}.`);
  }
  if (asset.modificationPolicy === "locked" && asset.allowedTreatments.length > 0) {
    reasons.push(`Asset ${asset.id} is locked and cannot declare treatment changes.`);
  }
  return result(reasons);
}

export function describeUnknownRightsRestriction(asset: AssetRecord): string | undefined {
  if (asset.rightsStatus !== "unknown") {
    return undefined;
  }
  return `Asset ${asset.id} (${asset.title}) has unknown rights: limited to private local HTML/SVG exploration; cannot be sent to cloud providers, promoted, handed off, or published.`;
}

function assetPromotionReasons(asset: AssetRecord, provider: CreativeProvider): string[] {
  const reasons: string[] = [];
  if (asset.rightsStatus === "unknown") {
    reasons.push(`Asset ${asset.id} has unknown rights and cannot be promoted.`);
  }
  if (asset.storage.kind === "private") {
    reasons.push(`Asset ${asset.id} uses private storage and cannot be referenced by a project-visible artifact.`);
  }
  if (asset.modificationPolicy === "locked" && asset.allowedTreatments.length > 0) {
    reasons.push(`Asset ${asset.id} is locked and cannot declare treatment changes.`);
  }
  if (asset.modificationPolicy === "inspiration-only") {
    reasons.push(`Asset ${asset.id} is inspiration-only and cannot be used in a deliverable.`);
  }
  for (const reason of canUseAssetWithProvider(asset, provider).reasons) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
  return reasons;
}

export function canPromoteArtifact(
  manifest: ProjectManifest,
  artifact: ArtifactRecord
): PolicyResult {
  const reasons: string[] = [];
  for (const assetId of [...new Set(artifact.assetIds)].sort()) {
    const asset = manifest.assets.find((candidate) => candidate.id === assetId);
    if (asset === undefined) {
      reasons.push(`Artifact ${artifact.id} v${artifact.version} references missing asset ${assetId}.`);
      continue;
    }
    reasons.push(...assetPromotionReasons(asset, artifact.provider ?? DEFAULT_LOCAL_PROVIDER));
  }
  return result(reasons);
}

export function hasDecisionOwnerApproval(
  manifest: ProjectManifest,
  artifact: ArtifactRecord,
  area: DecisionOwnerRecord["area"]
): boolean {
  const owner = ownerFor(manifest, area);
  if (owner === undefined) {
    return true;
  }
  if (artifact.status !== "approved") {
    return false;
  }
  const effective = effectiveArtifactDecision(manifest, artifact);
  return effective?.decision === "approved" && effective.reviewerId === owner.participantId;
}

function openFeedbackIssues(feedback: FeedbackRecord): ManifestPolicyIssue[] {
  if (feedback.resolutionStatus !== "open") {
    return [];
  }
  const issues: ManifestPolicyIssue[] = [];
  if (feedback.classifications.includes("approval-condition")) {
    issues.push({
      code: "feedback-condition-open",
      subjectId: feedback.id,
      message: `Feedback ${feedback.id} remains an open approval condition.`
    });
  }
  if (feedback.classifications.includes("unresolved-conflict")) {
    issues.push({
      code: "feedback-condition-open",
      subjectId: feedback.id,
      message: `Feedback ${feedback.id} remains an unresolved conflict.`
    });
  }
  return issues;
}

function ownerIssue(
  manifest: ProjectManifest,
  artifact: ArtifactRecord,
  area: DecisionOwnerRecord["area"]
): ManifestPolicyIssue | undefined {
  const owner = ownerFor(manifest, area);
  if (owner === undefined || hasDecisionOwnerApproval(manifest, artifact, area)) {
    return undefined;
  }
  return {
    code: "decision-owner-approval-missing",
    subjectId: artifact.id,
    message: `Artifact ${artifact.id} v${artifact.version} requires approval from ${area} owner ${owner.participantId}.`
  };
}

function exactStudyConditions(manifest: ProjectManifest, study: ArtifactRecord): boolean {
  return manifest.feedback.some((feedback) =>
    feedback.resolutionStatus === "open"
    && feedback.classifications.includes("approval-condition")
    && feedback.target?.kind === "artifact"
    && feedback.target.id === study.id
    && feedback.target.version === study.version
  );
}

function referencedAssetIssues(
  artifact: ArtifactRecord,
  asset: AssetRecord
): ManifestPolicyIssue[] {
  const issues: ManifestPolicyIssue[] = [];
  if (artifact.visibility === "project" && asset.storage.kind === "private") {
    issues.push({
      code: "asset-private-reference",
      subjectId: asset.id,
      message: `Private asset ${asset.id} is referenced by project-visible artifact ${artifact.id} v${artifact.version}.`
    });
  }
  if (artifact.visibility === "project" && asset.rightsStatus === "unknown") {
    issues.push({
      code: "asset-rights-blocked",
      subjectId: asset.id,
      message: `Asset ${asset.id} has unknown rights and cannot be used by project-visible artifact ${artifact.id} v${artifact.version}.`
    });
  }
  if (artifact.visibility === "project" && asset.modificationPolicy === "inspiration-only") {
    issues.push({
      code: "asset-rights-blocked",
      subjectId: asset.id,
      message: `Asset ${asset.id} is inspiration-only and cannot be used in deliverable artifact ${artifact.id} v${artifact.version}.`
    });
  }
  if (artifact.provider !== undefined) {
    for (const reason of canUseAssetWithProvider(asset, artifact.provider).reasons) {
      issues.push({
        code: "asset-provider-blocked",
        subjectId: asset.id,
        message: reason
      });
    }
  }
  return issues;
}

/** Historical handoffs stored artifact IDs in assetIds; retain that narrow compatibility. */
export function missingArtifactAssetIssues(manifest: ProjectManifest, artifact: ArtifactRecord): ManifestPolicyIssue[] {
  return [...new Set(artifact.assetIds)].sort().flatMap((id) => {
    if (manifest.assets.some((asset) => asset.id === id)
      || (artifact.kind === "implementation-handoff" && manifest.artifacts.some((candidate) => candidate.id === id))) return [];
    return [{ code: "asset-reference-missing" as const, subjectId: artifact.id,
      message: `Artifact ${artifact.id} v${artifact.version} references missing asset ${id}.` }];
  });
}

function handoffIntegrityIssues(
  manifest: ProjectManifest,
  handoff: ArtifactRecord,
  latest: ArtifactRecord[]
): ManifestPolicyIssue[] {
  const issues: ManifestPolicyIssue[] = [];
  const artifactsById = new Map(latest.map((artifact) => [artifact.id, artifact]));
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  if (handoff.status === "provisional" || handoff.visibility === "private") {
    issues.push({
      code: "provisional-in-handoff",
      subjectId: handoff.id,
      message: `Implementation handoff ${handoff.id} v${handoff.version} is provisional or private.`
    });
  }
  const referenceIds = [...new Set(handoff.assetIds)].sort();
  const artifactReferenceIds = new Set<string>();
  for (const assetId of referenceIds) {
    const referencedAsset = assetsById.get(assetId);
    if (referencedAsset === undefined && artifactsById.has(assetId)) artifactReferenceIds.add(assetId);
    for (const artifactId of referencedAsset?.relatedArtifactIds ?? []) {
      artifactReferenceIds.add(artifactId);
    }
  }
  for (const referenceId of [...artifactReferenceIds].sort()) {
    const referencedArtifact = artifactsById.get(referenceId);
    if (referencedArtifact === undefined) {
      // General relationship checks report absent relatedArtifactIds.
      continue;
    }
    if (
      referencedArtifact.status === "provisional" || referencedArtifact.visibility === "private"
    ) {
      issues.push({
        code: "provisional-in-handoff",
        subjectId: referencedArtifact.id,
        message: `Implementation handoff ${handoff.id} references provisional or private artifact ${referencedArtifact.id} v${referencedArtifact.version}.`
      });
    } else if (referencedArtifact.status !== "approved") {
      issues.push({ code: "handoff-artifact-unapproved", subjectId: referencedArtifact.id,
        message: `Implementation handoff ${handoff.id} references artifact ${referencedArtifact.id} v${referencedArtifact.version} with status ${referencedArtifact.status}; an approved project-visible artifact is required.` });
    }
  }
  for (const referenceId of referenceIds) {
    const referencedAsset = assetsById.get(referenceId);
    if (referencedAsset === undefined) {
      continue;
    }
    const provider = handoff.provider ?? DEFAULT_LOCAL_PROVIDER;
    for (const reason of canUseAssetWithProvider(referencedAsset, provider).reasons) {
      issues.push({ code: "asset-provider-blocked", subjectId: referencedAsset.id, message: reason });
    }
    if (referencedAsset.rightsStatus === "unknown") {
      issues.push({
        code: "asset-rights-blocked",
        subjectId: referencedAsset.id,
        message: `Asset ${referencedAsset.id} has unknown rights and cannot enter implementation handoff ${handoff.id}.`
      });
    }
    if (referencedAsset.modificationPolicy === "inspiration-only") {
      issues.push({
        code: "asset-rights-blocked",
        subjectId: referencedAsset.id,
        message: `Asset ${referencedAsset.id} is inspiration-only and cannot enter implementation handoff ${handoff.id}.`
      });
    }
  }
  return issues;
}

function issueKey(issue: ManifestPolicyIssue): string {
  return `${issue.code}\0${issue.subjectId}\0${issue.message}`;
}

export function evaluateManifestPolicy(manifest: ProjectManifest): ManifestPolicyIssue[] {
  const issues: ManifestPolicyIssue[] = [];
  const latest = latestArtifacts(manifest);
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));

  for (const feedback of [...manifest.feedback].sort(compareById)) {
    issues.push(...openFeedbackIssues(feedback));
  }

  for (const artifact of latest) {
    issues.push(...missingArtifactAssetIssues(manifest, artifact));
    for (const assetId of [...new Set(artifact.assetIds)].sort()) {
      const asset = assetsById.get(assetId);
      if (asset !== undefined) {
        issues.push(...referencedAssetIssues(artifact, asset));
      }
    }
  }

  const artifactIds = new Set(manifest.artifacts.map((artifact) => artifact.id));
  const feedbackIds = new Set(manifest.feedback.map((feedback) => feedback.id));
  for (const asset of [...manifest.assets].sort(compareById)) {
    for (const id of [...new Set(asset.relatedArtifactIds)].sort()) {
      if (!artifactIds.has(id)) issues.push({ code: "artifact-reference-missing", subjectId: asset.id,
        message: `Asset ${asset.id} references missing related artifact ${id}.` });
    }
    for (const id of [...new Set(asset.relatedFeedbackIds)].sort()) {
      if (!feedbackIds.has(id)) issues.push({ code: "feedback-reference-missing", subjectId: asset.id,
        message: `Asset ${asset.id} references missing related feedback ${id}.` });
    }
  }
  for (const feedback of [...manifest.feedback].sort(compareById)) {
    for (const id of [...new Set(feedback.resultingArtifactIds)].sort()) {
      if (!artifactIds.has(id)) issues.push({ code: "artifact-reference-missing", subjectId: feedback.id,
        message: `Feedback ${feedback.id} references missing resulting artifact ${id}.` });
    }
  }

  const creativeArtifacts = latest.filter((artifact) =>
    (artifact.kind === "creative-territory" || artifact.kind === "visual-language")
    && artifact.status === "approved"
  );
  for (const artifact of creativeArtifacts) {
    const issue = ownerIssue(manifest, artifact, "creative-direction");
    if (issue !== undefined) {
      issues.push(issue);
    }
  }
  for (const artifact of latest.filter((candidate) =>
    candidate.kind === "composition-study" && exactStudyConditions(manifest, candidate)
  )) {
    const issue = ownerIssue(manifest, artifact, "creative-direction");
    if (issue !== undefined) {
      issues.push(issue);
    }
  }
  for (const handoff of latest.filter((artifact) => artifact.kind === "implementation-handoff")) {
    const issue = ownerIssue(manifest, handoff, "implementation-readiness");
    if (issue !== undefined) {
      issues.push(issue);
    }
    issues.push(...handoffIntegrityIssues(manifest, handoff, latest));
  }

  const unique = new Map<string, ManifestPolicyIssue>();
  for (const issue of issues) {
    unique.set(issueKey(issue), issue);
  }
  return [...unique.values()];
}

export function evaluateHandoffPolicy(manifest: ProjectManifest): PolicyResult {
  return result(evaluateManifestPolicy(manifest).map((issue) => issue.message));
}
