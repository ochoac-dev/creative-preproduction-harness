import { describe, expect, it } from "vitest";
import {
  applyReviewDecision,
  createArtifact,
  recordApproval,
  reviseArtifact
} from "../../src/services/artifacts.js";
import type { ArtifactRecord, ProjectManifest } from "../../src/domain/schema.js";

const createdAt = "2026-09-16T18:00:00.000Z";

const approvedArtifact: ArtifactRecord = {
  id: "identity",
  kind: "identity-thesis",
  version: 1,
  path: "identity-thesis-v1.md",
  status: "approved",
  visibility: "project",
  assetIds: [],
  rationale: "Connects archival history with living culture.",
  createdAt,
  updatedAt: createdAt
};

describe("artifact construction and revision", () => {
  it("creates a first draft with the supplied rationale and timestamp", () => {
    const artifact = createArtifact({
      id: "brief",
      kind: "creative-brief",
      path: "creative-brief-v1.md",
      rationale: "Frames the work before research begins.",
      now: new Date(createdAt)
    });

    expect(artifact).toEqual({
      id: "brief",
      kind: "creative-brief",
      version: 1,
      path: "creative-brief-v1.md",
      status: "draft",
      visibility: "project",
      assetIds: [],
      rationale: "Frames the work before research begins.",
      createdAt,
      updatedAt: createdAt
    });
  });

  it("creates a new version instead of overwriting an approved artifact", () => {
    const revised = reviseArtifact(approvedArtifact, {
      path: "identity-thesis-v2.md",
      rationale: "Strengthen the contrast between archive and participation.",
      now: new Date("2026-09-17T18:00:00Z")
    });

    expect(revised).toMatchObject({
      id: "identity",
      version: 2,
      parentVersion: 1,
      status: "draft",
      visibility: "project",
      assetIds: []
    });
    expect(approvedArtifact).toEqual({
      id: "identity",
      kind: "identity-thesis",
      version: 1,
      path: "identity-thesis-v1.md",
      status: "approved",
      visibility: "project",
      assetIds: [],
      rationale: "Connects archival history with living culture.",
      createdAt,
      updatedAt: createdAt
    });
  });

  it("rejects a revision without a substantive rationale", () => {
    expect(() => reviseArtifact(approvedArtifact, {
      path: "identity-thesis-v2.md",
      rationale: "   "
    })).toThrow("Artifact rationale must not be empty.");
  });

  it("rejects a revision that reuses the current artifact's path", () => {
    expect(() => reviseArtifact(approvedArtifact, {
      path: approvedArtifact.path,
      rationale: "This must have a separate versioned file."
    })).toThrow(/different path/i);
    expect(approvedArtifact.path).toBe("identity-thesis-v1.md");
    expect(approvedArtifact.version).toBe(1);
  });
});

describe("approval recording", () => {
  it("records an approval and returns a new approved artifact", () => {
    const result = recordApproval({
      artifact: { ...approvedArtifact, status: "in-review" },
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reason: "Ready to proceed.",
      now: new Date("2026-09-17T18:30:00Z")
    });

    expect(result.artifact.status).toBe("approved");
    expect(result.approval).toMatchObject({
      artifactId: "identity",
      artifactVersion: 1,
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reason: "Ready to proceed.",
      createdAt: "2026-09-17T18:30:00.000Z"
    });
    expect(result.approval.id).toBe("identity-v1-creative-lead-approved-2026-09-17T18:30:00.000Z-mina-shah");
  });

  it("keeps conditionally approved artifacts in review", () => {
    const result = recordApproval({
      artifact: { ...approvedArtifact, status: "in-review" },
      tier: "peer",
      decision: "approved-with-conditions",
      reviewer: "Morgan Lee",
      reason: "Add usage examples.",
      now: new Date("2026-09-17T18:30:00Z")
    });

    expect(result.artifact.status).toBe("in-review");
    expect(result.approval.decision).toBe("approved-with-conditions");
  });

  it("returns artifacts to draft without modifying the supplied artifact", () => {
    const inReview = { ...approvedArtifact, status: "in-review" as const };
    const result = recordApproval({
      artifact: inReview,
      tier: "peer",
      decision: "returned",
      reviewer: "Morgan Lee",
      reason: "The hierarchy needs a clearer primary message.",
      now: new Date("2026-09-17T18:30:00Z")
    });

    expect(result.artifact.status).toBe("draft");
    expect(inReview.status).toBe("in-review");
  });

  it("rejects approvals for provisional artifacts", () => {
    expect(() => recordApproval({
      artifact: { ...approvedArtifact, status: "provisional" },
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reason: "Ready to proceed."
    })).toThrow("Provisional artifacts cannot be approved; promote the work to a draft first.");
  });

  it("rejects approvals without a named reviewer or reason", () => {
    const baseInput = {
      artifact: approvedArtifact,
      tier: "self" as const,
      decision: "approved" as const,
      now: new Date("2026-09-17T18:30:00Z")
    };

    expect(() => recordApproval({ ...baseInput, reviewer: " ", reason: "Ready." }))
      .toThrow("Approval reviewer must not be empty.");
    expect(() => recordApproval({ ...baseInput, reviewer: "Mina Shah", reason: " " }))
      .toThrow("Approval reason must not be empty.");
  });
});

describe("manifest review decisions", () => {
  function manifest(artifacts: ArtifactRecord[]): ProjectManifest {
    return {
      schemaVersion: 2,
      harnessVersion: "0.1.0",
      project: { id: "museum", name: "Museum", kind: "new-site" },
      stage: "review",
      participants: [],
      decisionOwners: [],
      artifacts,
      approvals: [],
      assets: [],
      feedback: [],
      references: [],
      unresolvedQuestions: [],
      createdAt,
      updatedAt: createdAt
    };
  }

  it("applies an explicit review to the exact artifact version", () => {
    const v1 = { ...approvedArtifact, id: "visual-language", kind: "visual-language" as const };
    const v2 = { ...v1, version: 2, parentVersion: 1, status: "in-review" as const };
    const reviewed = applyReviewDecision(manifest([v1, v2]), {
      artifactId: "visual-language",
      artifactVersion: 2,
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reviewerId: "mina-shah",
      reason: "The image treatment and responsive composition preserve the approved direction.",
      now: new Date(createdAt)
    });

    expect(reviewed.approvals.at(-1)?.artifactVersion).toBe(2);
    expect(reviewed.approvals.at(-1)?.reviewerId).toBe("mina-shah");
    expect(reviewed.artifacts.find(({ id, version }) => id === "visual-language" && version === 2)?.status)
      .toBe("approved");
    expect(reviewed.artifacts[0]).toBe(v1);
  });

  it("appends later decisions without mutating an already persisted approved artifact", () => {
    const persisted = { ...approvedArtifact };
    const project = manifest([persisted]);
    const reviewed = applyReviewDecision(project, {
      artifactId: persisted.id,
      artifactVersion: persisted.version,
      tier: "creative-lead",
      decision: "returned",
      reviewer: "Mina Shah",
      reviewerId: "mina-shah",
      reason: "Revisit the responsive crop.",
      now: new Date("2026-09-17T19:00:00Z")
    });

    expect(reviewed.artifacts[0]).toBe(persisted);
    expect(reviewed.artifacts[0]).toEqual(approvedArtifact);
    expect(reviewed.approvals).toHaveLength(1);
    expect(reviewed.approvals[0]?.decision).toBe("returned");
  });

  it("rejects missing versions and provisional artifacts", () => {
    const provisional = { ...approvedArtifact, status: "provisional" as const };
    const input = {
      artifactId: approvedArtifact.id,
      artifactVersion: 2,
      tier: "creative-lead" as const,
      decision: "approved" as const,
      reviewer: "Mina Shah",
      reason: "Ready."
    };

    expect(() => applyReviewDecision(manifest([approvedArtifact]), input))
      .toThrow("Artifact identity v2 does not exist.");
    expect(() => applyReviewDecision(manifest([provisional]), { ...input, artifactVersion: 1 }))
      .toThrow(/provisional artifacts cannot be approved/i);
  });
});
