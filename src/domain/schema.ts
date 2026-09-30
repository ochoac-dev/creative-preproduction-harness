import { z } from "zod";
import { requirePersistedPrivateArtifactPath } from "./artifact-path.js";

const IsoDate = z.string().datetime({ offset: true });

export const ProjectKindSchema = z.enum(["new-site", "existing-site"]);
export const StageSchema = z.enum([
  "brief", "research", "territories", "visual-language", "exploration", "review", "handoff"
]);
export const ArtifactKindSchema = z.enum([
  "creative-brief", "existing-site-audit", "identity-thesis", "research-board",
  "creative-territory", "visual-language", "composition-study", "decision-journal",
  "implementation-handoff", "asset-dossier"
]);

export const ReferenceRecordSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  relevance: z.string().min(1),
  lesson: z.string().min(1),
  avoidCopying: z.string().min(1),
  attribution: z.string().min(1),
  licenseStatus: z.enum(["verified", "unknown", "not-applicable"]),
  licenseNotes: z.string().min(1)
}).strict();

export const ParticipantRoleSchema = z.enum([
  "creative-lead", "stakeholder", "developer", "peer"
]);

export const DecisionAreaSchema = z.enum([
  "creative-direction", "business-direction", "implementation-readiness"
]);

export const ArtifactStatusSchema = z.enum([
  "provisional", "draft", "in-review", "approved", "superseded"
]);

export const ArtifactVisibilitySchema = z.enum(["private", "project"]);

const LegacyArtifactRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "creative-brief", "existing-site-audit", "identity-thesis", "research-board",
    "creative-territory", "visual-language", "composition-study", "decision-journal",
    "implementation-handoff"
  ]),
  version: z.number().int().positive(),
  path: z.string().min(1),
  status: z.enum(["draft", "in-review", "approved", "superseded"]),
  rationale: z.string().min(1),
  parentVersion: z.number().int().positive().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

const LegacyApprovalRecordSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  artifactVersion: z.number().int().positive(),
  tier: z.enum(["self", "peer", "creative-lead", "stakeholder"]),
  decision: z.enum(["approved", "approved-with-conditions", "returned"]),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
  createdAt: IsoDate
}).strict();

export const ProjectManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  harnessVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: ProjectKindSchema
  }).strict(),
  stage: StageSchema,
  artifacts: z.array(LegacyArtifactRecordSchema),
  approvals: z.array(LegacyApprovalRecordSchema),
  references: z.array(ReferenceRecordSchema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const ParticipantRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  role: ParticipantRoleSchema,
  createdAt: IsoDate
}).strict();

export const DecisionOwnerRecordSchema = z.object({
  area: DecisionAreaSchema,
  participantId: z.string().min(1)
}).strict();

export const AssetStorageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("managed"), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("private"), ref: z.string().regex(/^[a-z0-9-]+$/) }).strict()
]);

export const AssetRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  creator: z.string().min(1).optional(),
  source: z.string().min(1),
  creativeOwner: z.string().min(1).optional(),
  intendedRole: z.string().min(1),
  modificationPolicy: z.enum(["locked", "adaptable", "inspiration-only"]),
  rightsStatus: z.enum(["cleared", "restricted", "unknown"]),
  providerScopes: z.array(z.enum(["local-html-svg", "figma", "manual"])),
  storage: AssetStorageSchema,
  allowedTreatments: z.array(z.string().min(1)),
  prohibitedTreatments: z.array(z.string().min(1)),
  visualNotes: z.record(z.string(), z.string().min(1)),
  responsiveGuidance: z.string().min(1),
  accessibilityIntent: z.string().min(1),
  relatedArtifactIds: z.array(z.string().min(1)),
  relatedFeedbackIds: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const FeedbackClassificationSchema = z.enum([
  "question", "requested-change", "creative-direction", "constraint", "suggestion",
  "approval-condition", "unresolved-conflict", "positive-feedback"
]);

export const FeedbackTargetSchema = z.object({
  kind: z.enum(["project", "asset", "artifact"]),
  id: z.string().min(1),
  version: z.number().int().positive().optional()
}).strict();

export const FeedbackRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  originalText: z.string().min(1),
  author: z.string().min(1).optional(),
  source: z.string().min(1),
  sourceDate: IsoDate.optional(),
  target: FeedbackTargetSchema.optional(),
  classifications: z.array(FeedbackClassificationSchema).min(1),
  interpretation: z.string().min(1),
  resolutionStatus: z.enum(["open", "resolved", "superseded"]),
  resolution: z.string().min(1).optional(),
  resultingArtifactIds: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const ArtifactRecordSchema = z.object({
  id: z.string().min(1),
  kind: ArtifactKindSchema,
  version: z.number().int().positive(),
  path: z.string().min(1),
  status: ArtifactStatusSchema,
  visibility: ArtifactVisibilitySchema.default("project"),
  assetIds: z.array(z.string().min(1)).default([]),
  provider: z.enum(["local-html-svg", "figma", "manual"]).optional(),
  question: z.string().trim().min(1).optional(),
  assumptions: z.array(z.string().trim().min(1)).optional(),
  blockers: z.array(z.string().trim().min(1)).optional(),
  rationale: z.string().min(1),
  parentVersion: z.number().int().positive().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict().superRefine((artifact, context) => {
  if (artifact.status !== "provisional") {
    return;
  }
  if (artifact.visibility !== "private") {
    context.addIssue({
      code: "custom",
      path: ["visibility"],
      message: "Provisional artifacts must remain private."
    });
  }
  try {
    requirePersistedPrivateArtifactPath(artifact.path);
  } catch (error: unknown) {
    context.addIssue({
      code: "custom",
      path: ["path"],
      message: (error as Error).message
    });
  }
  for (const field of ["question", "assumptions", "blockers"] as const) {
    if (artifact[field] === undefined) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `Provisional artifacts require ${field}.`
      });
    }
  }
});

export const ApprovalRecordSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  artifactVersion: z.number().int().positive(),
  tier: z.enum(["self", "peer", "creative-lead", "stakeholder"]),
  decision: z.enum(["approved", "approved-with-conditions", "returned"]),
  reviewer: z.string().min(1),
  reviewerId: z.string().min(1).optional(),
  reason: z.string().min(1),
  createdAt: IsoDate
}).strict();

export const ProjectManifestSchema = z.object({
  schemaVersion: z.literal(2),
  harnessVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: ProjectKindSchema
  }).strict(),
  stage: StageSchema,
  participants: z.array(ParticipantRecordSchema),
  decisionOwners: z.array(DecisionOwnerRecordSchema),
  artifacts: z.array(ArtifactRecordSchema),
  approvals: z.array(ApprovalRecordSchema),
  assets: z.array(AssetRecordSchema),
  feedback: z.array(FeedbackRecordSchema),
  references: z.array(ReferenceRecordSchema),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict().superRefine((manifest, context) => {
  const assetIds = new Set<string>();
  manifest.assets.forEach((asset, index) => {
    if (assetIds.has(asset.id)) {
      context.addIssue({
        code: "custom",
        path: ["assets", index, "id"],
        message: "Asset IDs must be unique."
      });
    }
    assetIds.add(asset.id);
  });

  const artifactIdentities = new Set<string>();
  manifest.artifacts.forEach((artifact, index) => {
    const identity = `${artifact.id}\u0000${artifact.version}`;
    if (artifactIdentities.has(identity)) {
      context.addIssue({
        code: "custom",
        path: ["artifacts", index, "version"],
        message: "Artifact ID and version identities must be unique."
      });
    }
    artifactIdentities.add(identity);
  });
});

export const AnyProjectManifestSchema = z.union([
  ProjectManifestSchema,
  ProjectManifestV1Schema
]);

export type ProjectKind = z.infer<typeof ProjectKindSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ReferenceRecord = z.infer<typeof ReferenceRecordSchema>;
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;
export type DecisionArea = z.infer<typeof DecisionAreaSchema>;
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type ArtifactVisibility = z.infer<typeof ArtifactVisibilitySchema>;
export type ProjectManifestV1 = z.infer<typeof ProjectManifestV1Schema>;
export type LegacyProjectManifest = ProjectManifestV1;
export type ParticipantRecord = z.infer<typeof ParticipantRecordSchema>;
export type DecisionOwnerRecord = z.infer<typeof DecisionOwnerRecordSchema>;
export type AssetStorage = z.infer<typeof AssetStorageSchema>;
export type AssetRecord = z.infer<typeof AssetRecordSchema>;
export type FeedbackClassification = z.infer<typeof FeedbackClassificationSchema>;
export type FeedbackTarget = z.infer<typeof FeedbackTargetSchema>;
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export type AnyProjectManifest = z.infer<typeof AnyProjectManifestSchema>;
