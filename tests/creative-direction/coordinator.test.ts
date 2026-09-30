import { describe, expect, it } from "vitest";
import type {
  AssetRecord,
  FeedbackClassification,
  ProjectManifest
} from "../../src/domain/schema.js";
import { createFeedback } from "../../src/services/feedback.js";
import {
  describeNextCreativeAction,
  determinePostures
} from "../../src/creative-direction/coordinator.js";
import { buildQuestionPacket } from "../../src/creative-direction/questions.js";

const now = "2026-09-17T18:00:00.000Z";

function asset(): AssetRecord {
  return {
    id: "campaign-portrait",
    title: "Campaign portrait",
    source: "Creative handoff",
    intendedRole: "Primary home-page story image",
    modificationPolicy: "adaptable",
    rightsStatus: "cleared",
    providerScopes: ["local-html-svg"],
    storage: { kind: "managed", path: "public/images/campaign-portrait.jpg" },
    allowedTreatments: ["responsive crop"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third" },
    responsiveGuidance: "Protect the face on smaller screens.",
    accessibilityIntent: "Identify the featured artist.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: ["May the mobile crop move the subject?"],
    createdAt: now,
    updatedAt: now
  };
}

function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
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
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("creative direction coordination", () => {
  it("leads when no creative lead exists and partners when one participates", () => {
    expect(determinePostures(manifest())).toEqual(["lead"]);
    expect(determinePostures(manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }]
    }))).toEqual(["partner"]);
  });

  it("adds expansion posture for supplied assets", () => {
    expect(determinePostures(manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }],
      assets: [asset()]
    }))).toEqual(["partner", "expansion"]);
  });

  it("builds one deterministic packet from project, asset, and qualifying open feedback questions", () => {
    const question = createFeedback({
      id: "feedback-crop-question",
      originalText: "Confirm the minimum negative-space requirement.",
      source: "Team chat",
      classifications: ["question"],
      interpretation: "Confirm the crop boundary.",
      now: new Date(now)
    });
    const constraint = createFeedback({
      id: "feedback-portrait-1",
      originalText: "Keep the crop wide.",
      source: "Team chat",
      classifications: ["constraint"],
      interpretation: "Preserve the wide crop.",
      now: new Date(now)
    });
    const resolvedConflict = createFeedback({
      id: "feedback-resolved-conflict",
      originalText: "The subject should be centered.",
      source: "Review meeting",
      classifications: ["unresolved-conflict"],
      interpretation: "Consider centering the subject.",
      now: new Date(now)
    });
    const packet = buildQuestionPacket(manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }],
      assets: [asset()],
      unresolvedQuestions: ["What should visitors understand first?", "What should visitors understand first?"],
      feedback: [question, constraint, { ...resolvedConflict, resolutionStatus: "resolved", resolution: "Closed." }]
    }));

    expect(packet).toEqual({
      postures: ["partner", "expansion"],
      recipientParticipantId: "mina-shah",
      items: [
        { source: "project", question: "What should visitors understand first?" },
        { source: "asset:campaign-portrait", question: "May the mobile crop move the subject?" },
        { source: "feedback:feedback-crop-question", question: "Confirm the minimum negative-space requirement." }
      ]
    });
  });

  it.each([
    ["question", "feedback-question"],
    ["approval-condition", "feedback-approval-condition"],
    ["unresolved-conflict", "feedback-unresolved-conflict"]
  ] as Array<[FeedbackClassification, string]>)(
    "uses open %s feedback consistently and excludes its resolved record",
    (classification, id) => {
      const feedback = createFeedback({
        id,
        originalText: `Resolve ${classification} feedback.`,
        source: "Review meeting",
        classifications: [classification],
        interpretation: "Needs a human response.",
        now: new Date(now)
      });
      const open = manifest({ feedback: [feedback] });
      const resolved = manifest({
        feedback: [{ ...feedback, resolutionStatus: "resolved", resolution: "Closed." }]
      });

      expect(buildQuestionPacket(open).items).toEqual([
        { source: `feedback:${id}`, question: `Resolve ${classification} feedback.` }
      ]);
      expect(describeNextCreativeAction(open))
        .toBe(`Resolve open feedback ${id}: Resolve ${classification} feedback.`);
      expect(buildQuestionPacket(resolved).items).toEqual([]);
      expect(describeNextCreativeAction(resolved))
        .toBe("Develop a provisional direction and request focused human feedback.");
    }
  );

  it("describes the next action from the available unresolved evidence without score language", () => {
    const action = describeNextCreativeAction(manifest({
      unresolvedQuestions: ["What should visitors understand first?"]
    }));

    expect(action).toBe("Ask the next unresolved project question: What should visitors understand first?");
    expect(action).not.toMatch(/score|grade|rating|percent/i);
  });
});
