import type { ProjectManifest } from "../domain/schema.js";
import { isOpenQuestionFeedback } from "./feedback.js";

export type CreativePosture = "lead" | "partner" | "expansion";

export function determinePostures(manifest: ProjectManifest): CreativePosture[] {
  const postures: CreativePosture[] = [manifest.participants.some(
    (participant) => participant.role === "creative-lead"
  ) ? "partner" : "lead"];
  if (manifest.assets.length > 0) {
    postures.push("expansion");
  }
  return postures;
}

export function describeNextCreativeAction(manifest: ProjectManifest): string {
  const projectQuestion = manifest.unresolvedQuestions[0];
  if (projectQuestion !== undefined) {
    return `Ask the next unresolved project question: ${projectQuestion}`;
  }

  for (const asset of manifest.assets) {
    const question = asset.unresolvedQuestions[0];
    if (question !== undefined) {
      return `Ask the next unresolved asset question for ${asset.id}: ${question}`;
    }
  }

  const feedback = manifest.feedback.find(isOpenQuestionFeedback);
  if (feedback !== undefined) {
    return `Resolve open feedback ${feedback.id}: ${feedback.originalText}`;
  }

  return manifest.participants.some((participant) => participant.role === "creative-lead")
    ? "Develop a provisional direction with the creative lead."
    : "Develop a provisional direction and request focused human feedback.";
}
