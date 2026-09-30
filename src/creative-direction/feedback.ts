import type { FeedbackClassification, FeedbackRecord } from "../domain/schema.js";

export const questionFeedbackClassifications = new Set<FeedbackClassification>([
  "question",
  "approval-condition",
  "unresolved-conflict"
]);

export function isOpenQuestionFeedback(feedback: FeedbackRecord): boolean {
  return feedback.resolutionStatus === "open" && feedback.classifications.some(
    (classification) => questionFeedbackClassifications.has(classification)
  );
}
