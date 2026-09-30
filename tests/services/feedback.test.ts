import { describe, expect, it } from "vitest";
import type { ProjectManifest } from "../../src/domain/schema.js";
import {
  addFeedback,
  createFeedback,
  resolveFeedback,
  type CreateFeedbackInput
} from "../../src/services/feedback.js";

const now = "2026-09-17T18:00:00.000Z";

function manifest(): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "brief",
    participants: [],
    decisionOwners: [],
    artifacts: [{
      id: "creative-brief",
      kind: "creative-brief",
      version: 1,
      path: ".creative-preproduction/brief.md",
      status: "draft",
      visibility: "project",
      assetIds: [],
      rationale: "Frames the work before research.",
      createdAt: now,
      updatedAt: now
    }],
    approvals: [],
    assets: [],
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

function feedback(
  overrides: Partial<Pick<CreateFeedbackInput, "id" | "originalText" | "target">> = {}
) {
  return createFeedback({
    id: overrides.id ?? "feedback-portrait-1",
    originalText: overrides.originalText
      ?? "Keep the crop wide.\nThe negative space is important — please do not fill it.",
    author: "Mina Shah",
    source: "Team chat",
    target: overrides.target ?? { kind: "artifact", id: "creative-brief", version: 1 },
    classifications: ["constraint", "creative-direction"],
    interpretation: "Preserve the image's left-side negative space.",
    now: new Date(now)
  });
}

describe("feedback construction", () => {
  it("preserves supplied feedback verbatim while keeping derived interpretation separate", () => {
    const originalText = "  Keep the crop wide.\nThe negative space is important — please do not fill it.  ";

    const record = feedback({ originalText });

    expect(record).toMatchObject({
      originalText,
      author: "Mina Shah",
      source: "Team chat",
      target: { kind: "artifact", id: "creative-brief", version: 1 },
      classifications: ["constraint", "creative-direction"],
      interpretation: "Preserve the image's left-side negative space.",
      resolutionStatus: "open",
      resultingArtifactIds: [],
      createdAt: now,
      updatedAt: now
    });
  });

  it("accepts optional source details without requiring a target", () => {
    const record = createFeedback({
      id: "feedback-general-1",
      originalText: "Please keep the tone direct.",
      source: "Workshop notes",
      sourceDate: new Date("2026-09-16T12:00:00Z"),
      classifications: ["suggestion", "creative-direction"],
      interpretation: "Use direct editorial language.",
      now: new Date(now)
    });

    expect(record).toMatchObject({
      sourceDate: "2026-09-16T12:00:00.000Z",
      classifications: ["suggestion", "creative-direction"]
    });
    expect(record.author).toBeUndefined();
    expect(record.target).toBeUndefined();
  });

  it("rejects blank feedback without rewriting non-blank source text", () => {
    expect(() => feedback({ originalText: " \n\t " })).toThrow(/feedback text.*blank/i);
    expect(feedback({ originalText: "\nA source note\n" }).originalText).toBe("\nA source note\n");
  });
});

describe("feedback mutations", () => {
  it("adds a target that exists in the current manifest and rejects duplicate or missing targets", () => {
    const current = manifest();
    const added = addFeedback(current, feedback());

    expect(added.feedback).toEqual([feedback()]);
    expect(() => addFeedback(added, feedback())).toThrow(/feedback.*already exists/i);
    expect(() => addFeedback(current, feedback({
      id: "feedback-missing-target",
      target: { kind: "artifact", id: "missing", version: 1 }
    }))).toThrow(/feedback target.*artifact.*does not exist/i);
  });

  it("resolves feedback without changing imported or derived source fields", () => {
    const current = addFeedback(manifest(), feedback());

    const resolved = resolveFeedback(current, {
      feedbackId: "feedback-portrait-1",
      resolution: "The revised crop retains the left-side negative space.",
      resultingArtifactIds: ["composition-study-2"],
      now: new Date("2026-09-18T18:00:00Z")
    });

    expect(resolved.feedback[0]).toMatchObject({
      originalText: "Keep the crop wide.\nThe negative space is important — please do not fill it.",
      author: "Mina Shah",
      source: "Team chat",
      classifications: ["constraint", "creative-direction"],
      interpretation: "Preserve the image's left-side negative space.",
      resolutionStatus: "resolved",
      resolution: "The revised crop retains the left-side negative space.",
      resultingArtifactIds: ["composition-study-2"],
      createdAt: now,
      updatedAt: "2026-09-18T18:00:00.000Z"
    });
    expect(current.feedback[0]?.resolutionStatus).toBe("open");
  });
});
