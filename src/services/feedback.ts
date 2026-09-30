import {
  FeedbackRecordSchema,
  type FeedbackClassification,
  type FeedbackRecord,
  type FeedbackTarget,
  type ProjectManifest
} from "../domain/schema.js";

export interface CreateFeedbackInput {
  id: string;
  originalText: string;
  author?: string;
  source: string;
  sourceDate?: Date;
  target?: FeedbackTarget;
  classifications: FeedbackClassification[];
  interpretation: string;
  now?: Date;
}

function timestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function requireNonBlank(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be blank.`);
  }
}

function cloneFeedback(feedback: FeedbackRecord): FeedbackRecord {
  return {
    ...feedback,
    ...(feedback.target === undefined ? {} : { target: { ...feedback.target } }),
    classifications: [...feedback.classifications],
    resultingArtifactIds: [...feedback.resultingArtifactIds]
  };
}

function assertTargetExists(manifest: ProjectManifest, target: FeedbackTarget): void {
  if (target.kind === "project") {
    if (target.id !== manifest.project.id) {
      throw new Error(`Feedback target project ${target.id} does not exist.`);
    }
    return;
  }

  if (target.kind === "asset") {
    if (!manifest.assets.some((asset) => asset.id === target.id)) {
      throw new Error(`Feedback target asset ${target.id} does not exist.`);
    }
    return;
  }

  const exists = manifest.artifacts.some((artifact) => artifact.id === target.id && (
    target.version === undefined || artifact.version === target.version
  ));
  if (!exists) {
    throw new Error(`Feedback target artifact ${target.id} does not exist.`);
  }
}

export function createFeedback(input: CreateFeedbackInput): FeedbackRecord {
  requireNonBlank(input.originalText, "Feedback text");
  const createdAt = timestamp(input.now);
  return FeedbackRecordSchema.parse({
    id: input.id,
    originalText: input.originalText,
    ...(input.author === undefined ? {} : { author: input.author }),
    source: input.source,
    ...(input.sourceDate === undefined ? {} : { sourceDate: input.sourceDate.toISOString() }),
    ...(input.target === undefined ? {} : { target: { ...input.target } }),
    classifications: [...input.classifications],
    interpretation: input.interpretation,
    resolutionStatus: "open",
    resultingArtifactIds: [],
    createdAt,
    updatedAt: createdAt
  });
}

export function addFeedback(manifest: ProjectManifest, feedback: FeedbackRecord): ProjectManifest {
  if (manifest.feedback.some((candidate) => candidate.id === feedback.id)) {
    throw new Error(`Feedback ${feedback.id} already exists.`);
  }
  const parsed = FeedbackRecordSchema.parse(feedback);
  if (parsed.target !== undefined) {
    assertTargetExists(manifest, parsed.target);
  }
  return {
    ...manifest,
    feedback: [...manifest.feedback, cloneFeedback(parsed)]
  };
}

export function resolveFeedback(
  manifest: ProjectManifest,
  input: { feedbackId: string; resolution: string; resultingArtifactIds?: string[]; now?: Date }
): ProjectManifest {
  requireNonBlank(input.resolution, "Feedback resolution");
  const current = manifest.feedback.find((feedback) => feedback.id === input.feedbackId);
  if (current === undefined) {
    throw new Error(`Feedback ${input.feedbackId} does not exist.`);
  }

  const resolved = FeedbackRecordSchema.parse({
    ...current,
    resolutionStatus: "resolved",
    resolution: input.resolution,
    resultingArtifactIds: [...(input.resultingArtifactIds ?? [])],
    updatedAt: timestamp(input.now)
  });

  return {
    ...manifest,
    feedback: manifest.feedback.map((feedback) => feedback.id === input.feedbackId
      ? cloneFeedback(resolved)
      : cloneFeedback(feedback))
  };
}
