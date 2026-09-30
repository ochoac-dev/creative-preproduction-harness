import { describe, expect, it } from "vitest";
import { ProjectManifestSchema } from "../../src/domain/schema.js";

const validV2Manifest = {
  schemaVersion: 2,
  harnessVersion: "0.2.0",
  project: { id: "museum-redesign", name: "Museum redesign", kind: "existing-site" },
  stage: "brief",
  participants: [],
  decisionOwners: [],
  artifacts: [],
  approvals: [],
  assets: [],
  feedback: [],
  references: [],
  unresolvedQuestions: [],
  createdAt: "2026-09-17T18:00:00.000Z",
  updatedAt: "2026-09-17T18:00:00.000Z"
};

describe("ProjectManifestSchema", () => {
  it("accepts a human-review workflow manifest", () => {
    expect(ProjectManifestSchema.parse(validV2Manifest).project.kind).toBe("existing-site");
  });

  it("rejects score-shaped fields at every depth", () => {
    const artifact = {
      id: "brief-1",
      kind: "creative-brief",
      version: 1,
      path: ".creative-preproduction/brief-v1.md",
      status: "draft",
      rationale: "Establishes shared intent.",
      visibility: "project",
      assetIds: [],
      createdAt: validV2Manifest.createdAt,
      updatedAt: validV2Manifest.updatedAt
    };
    const approval = {
      id: "approval-1",
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      tier: "peer",
      decision: "approved",
      reviewer: "Taylor",
      reason: "Ready for research.",
      createdAt: validV2Manifest.createdAt
    };
    const reference = {
      id: "reference-1",
      url: "https://example.com/reference",
      title: "Reference",
      relevance: "Editorial pacing",
      lesson: "Vary section density.",
      avoidCopying: "Do not reproduce the grid.",
      attribution: "Example Studio",
      licenseStatus: "verified",
      licenseNotes: "Licensed for internal reference."
    };
    const scoreShapedManifests = [
      { ...validV2Manifest, designScore: 92 },
      { ...validV2Manifest, project: { ...validV2Manifest.project, designScore: 92 } },
      { ...validV2Manifest, artifacts: [{ ...artifact, creativeScore: 92 }] },
      { ...validV2Manifest, approvals: [{ ...approval, confidenceScore: 92 }] },
      { ...validV2Manifest, references: [{ ...reference, relevanceScore: 92 }] }
    ];

    for (const manifest of scoreShapedManifests) {
      expect(() => ProjectManifestSchema.parse(manifest)).toThrow();
    }
  });

  it("requires a non-empty reason for conditional approval", () => {
    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      approvals: [{
        id: "approval-1",
        artifactId: "territory-1",
        artifactVersion: 1,
        tier: "peer",
        decision: "approved-with-conditions",
        reviewer: "Taylor",
        reason: "",
        createdAt: validV2Manifest.createdAt
      }]
    })).toThrow();
  });

  it("accepts provisional artifacts with private decision context", () => {
    expect(ProjectManifestSchema.parse({
      ...validV2Manifest,
      artifacts: [{
        id: "brief-1",
        kind: "creative-brief",
        version: 1,
        path: ".creative-preproduction/private/brief-v1.md",
        status: "provisional",
        visibility: "private",
        assetIds: [],
        question: "What should lead the opening composition?",
        assumptions: [],
        blockers: [],
        rationale: "Establishes shared intent.",
        createdAt: validV2Manifest.createdAt,
        updatedAt: validV2Manifest.updatedAt
      }]
    }).artifacts[0]?.status).toBe("provisional");
  });

  it("rejects provisional artifacts outside the normalized private workspace path", () => {
    const provisional = {
      id: "brief-1",
      kind: "creative-brief",
      version: 1,
      path: ".creative-preproduction/brief-v1.md",
      status: "provisional",
      visibility: "private",
      assetIds: [],
      question: "What should lead?",
      assumptions: [],
      blockers: [],
      rationale: "Tests a direction.",
      createdAt: validV2Manifest.createdAt,
      updatedAt: validV2Manifest.updatedAt
    };

    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      artifacts: [provisional]
    })).toThrow(/private workspace/i);
    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      artifacts: [{ ...provisional, path: ".creative-preproduction/private/../brief-v1.md" }]
    })).toThrow(/safe project-relative/i);
    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      artifacts: [{ ...provisional, path: "C:private-study.html" }]
    })).toThrow(/safe project-relative/i);
  });

  it("rejects duplicate asset IDs and artifact version identities", () => {
    const asset = {
      id: "portrait",
      title: "Portrait",
      source: "Client handoff",
      intendedRole: "Lead image",
      modificationPolicy: "adaptable",
      rightsStatus: "cleared",
      providerScopes: ["local-html-svg"],
      storage: { kind: "managed", path: "public/portrait.jpg" },
      allowedTreatments: [],
      prohibitedTreatments: [],
      visualNotes: {},
      responsiveGuidance: "Protect the face.",
      accessibilityIntent: "Featured artist portrait.",
      relatedArtifactIds: [],
      relatedFeedbackIds: [],
      unresolvedQuestions: [],
      createdAt: validV2Manifest.createdAt,
      updatedAt: validV2Manifest.updatedAt
    };
    const artifact = {
      id: "brief-1",
      kind: "creative-brief",
      version: 1,
      path: ".creative-preproduction/brief-v1.md",
      status: "draft",
      visibility: "project",
      assetIds: [],
      rationale: "Frames the project.",
      createdAt: validV2Manifest.createdAt,
      updatedAt: validV2Manifest.updatedAt
    };

    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      assets: [asset, { ...asset, rightsStatus: "unknown", storage: { kind: "private", ref: "portrait" } }]
    })).toThrow(/asset id.*unique/i);
    expect(() => ProjectManifestSchema.parse({
      ...validV2Manifest,
      artifacts: [artifact, { ...artifact, path: ".creative-preproduction/brief-copy.md" }]
    })).toThrow(/artifact.*version.*unique/i);
  });
});
