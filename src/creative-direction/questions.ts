import type { ProjectManifest } from "../domain/schema.js";
import { determinePostures, type CreativePosture } from "./coordinator.js";
import { isOpenQuestionFeedback } from "./feedback.js";

export interface QuestionPacketItem {
  source: string;
  question: string;
}

export interface QuestionPacket {
  postures: CreativePosture[];
  recipientParticipantId?: string;
  items: QuestionPacketItem[];
}

function questionRecipient(manifest: ProjectManifest): string | undefined {
  const lead = manifest.participants.find((participant) => participant.role === "creative-lead");
  if (lead !== undefined) {
    return lead.id;
  }
  return manifest.decisionOwners.find((owner) => owner.area === "creative-direction")?.participantId;
}

function appendUniqueQuestion(
  items: QuestionPacketItem[],
  questions: Set<string>,
  source: string,
  question: string
): void {
  if (!questions.has(question)) {
    questions.add(question);
    items.push({ source, question });
  }
}

export function buildQuestionPacket(manifest: ProjectManifest): QuestionPacket {
  const items: QuestionPacketItem[] = [];
  const questions = new Set<string>();

  for (const question of manifest.unresolvedQuestions) {
    appendUniqueQuestion(items, questions, "project", question);
  }
  for (const asset of manifest.assets) {
    for (const question of asset.unresolvedQuestions) {
      appendUniqueQuestion(items, questions, `asset:${asset.id}`, question);
    }
  }
  for (const feedback of manifest.feedback) {
    if (isOpenQuestionFeedback(feedback)) {
      items.push({ source: `feedback:${feedback.id}`, question: feedback.originalText });
    }
  }

  const recipientParticipantId = questionRecipient(manifest);
  return {
    postures: determinePostures(manifest),
    ...(recipientParticipantId === undefined ? {} : { recipientParticipantId }),
    items
  };
}
