import { describe, expect, it } from "vitest";
import type { ProjectManifest } from "../../src/domain/schema.js";
import { addParticipant, setDecisionOwner } from "../../src/services/participants.js";

const createdAt = "2026-09-17T18:00:00.000Z";

function manifest(): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "brief",
    participants: [],
    decisionOwners: [],
    artifacts: [],
    approvals: [],
    assets: [],
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt,
    updatedAt: createdAt
  };
}

describe("participants and decision owners", () => {
  it("rejects a duplicate participant ID without changing the manifest", () => {
    const withLead = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead",
      now: new Date(createdAt)
    });

    expect(() => addParticipant(withLead, {
      id: "mina-shah",
      name: "Mina Shah Again",
      role: "stakeholder"
    })).toThrow(/participant.*already exists/i);
    expect(withLead.participants).toHaveLength(1);
  });

  it("rejects assigning a decision owner who is not a participant", () => {
    expect(() => setDecisionOwner(manifest(), {
      area: "creative-direction",
      participantId: "mina-shah"
    })).toThrow(/participant.*does not exist/i);
  });

  it("validates participant records at runtime before adding them", () => {
    expect(() => addParticipant(manifest(), {
      id: "invalid participant",
      name: "Mina Shah",
      role: "creative-lead"
    })).toThrow();
    expect(() => addParticipant(manifest(), {
      id: "mina-shah",
      name: " ",
      role: "creative-lead"
    })).toThrow();
    expect(() => addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "director" as never
    })).toThrow();
  });

  it("validates decision-owner records at runtime before assigning them", () => {
    const withLead = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    });

    expect(() => setDecisionOwner(withLead, {
      area: "strategy" as never,
      participantId: "mina-shah"
    })).toThrow();
  });

  it("replaces the owner for one decision area and preserves other owners", () => {
    const withParticipants = addParticipant(addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    }), {
      id: "leo-wong",
      name: "Leo Wong",
      role: "stakeholder"
    });
    const withOwners = setDecisionOwner(setDecisionOwner(withParticipants, {
      area: "creative-direction",
      participantId: "mina-shah"
    }), {
      area: "business-direction",
      participantId: "leo-wong"
    });

    const replaced = setDecisionOwner(withOwners, {
      area: "creative-direction",
      participantId: "leo-wong"
    });

    expect(replaced.decisionOwners).toEqual([
      { area: "creative-direction", participantId: "leo-wong" },
      { area: "business-direction", participantId: "leo-wong" }
    ]);
    expect(withOwners.decisionOwners).toEqual([
      { area: "creative-direction", participantId: "mina-shah" },
      { area: "business-direction", participantId: "leo-wong" }
    ]);
  });
});
