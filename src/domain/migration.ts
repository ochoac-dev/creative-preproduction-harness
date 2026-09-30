import {
  ProjectManifestSchema,
  type LegacyProjectManifest,
  type ProjectManifest
} from "./schema.js";

export function migrateManifest(
  manifest: LegacyProjectManifest,
  harnessVersion: string,
  now: Date = new Date()
): ProjectManifest {
  return ProjectManifestSchema.parse({
    schemaVersion: 2,
    harnessVersion,
    project: manifest.project,
    stage: manifest.stage,
    participants: [],
    decisionOwners: [],
    artifacts: manifest.artifacts,
    approvals: manifest.approvals,
    assets: [],
    feedback: [],
    references: manifest.references,
    unresolvedQuestions: manifest.unresolvedQuestions,
    createdAt: manifest.createdAt,
    updatedAt: now.toISOString()
  });
}
