import type {
  DecisionOwnerRecord,
  ParticipantRecord,
  ProjectManifest
} from "../domain/schema.js";
import { DecisionOwnerRecordSchema, ParticipantRecordSchema } from "../domain/schema.js";

function timestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function requireNonBlank(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be blank.`);
  }
}

export function addParticipant(
  manifest: ProjectManifest,
  input: { id: string; name: string; role: ParticipantRecord["role"]; now?: Date }
): ProjectManifest {
  requireNonBlank(input.name, "Participant name");
  if (manifest.participants.some((participant) => participant.id === input.id)) {
    throw new Error(`Participant ${input.id} already exists.`);
  }

  const participant = ParticipantRecordSchema.parse({
    id: input.id,
    name: input.name,
    role: input.role,
    createdAt: timestamp(input.now)
  });
  return {
    ...manifest,
    participants: [...manifest.participants, participant]
  };
}

export function setDecisionOwner(
  manifest: ProjectManifest,
  input: { area: DecisionOwnerRecord["area"]; participantId: string }
): ProjectManifest {
  if (!manifest.participants.some((participant) => participant.id === input.participantId)) {
    throw new Error(`Participant ${input.participantId} does not exist.`);
  }

  const replacement = DecisionOwnerRecordSchema.parse({
    area: input.area,
    participantId: input.participantId
  });
  const existingIndex = manifest.decisionOwners.findIndex((owner) => owner.area === input.area);
  const decisionOwners = existingIndex === -1
    ? [...manifest.decisionOwners, replacement]
    : manifest.decisionOwners.map((owner, index) => index === existingIndex ? replacement : owner);

  return { ...manifest, decisionOwners };
}
