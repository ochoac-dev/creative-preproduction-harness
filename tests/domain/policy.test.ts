import { describe, expect, it } from "vitest";
import type {
  ApprovalRecord,
  ArtifactRecord,
  AssetRecord,
  FeedbackRecord,
  ProjectManifest
} from "../../src/domain/schema.js";
import {
  canPromoteArtifact,
  canUseAssetWithProvider,
  evaluateManifestPolicy,
  evaluateHandoffPolicy,
  hasDecisionOwnerApproval
} from "../../src/domain/policy.js";

const now = "2026-09-17T18:00:00.000Z";

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "campaign-portrait",
    title: "Campaign portrait",
    source: "Client handoff",
    intendedRole: "Home-page lead image",
    modificationPolicy: "adaptable",
    rightsStatus: "unknown",
    providerScopes: ["local-html-svg"],
    storage: { kind: "private", ref: "campaign-portrait" },
    allowedTreatments: ["responsive crop"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third" },
    responsiveGuidance: "Protect the face on narrow screens.",
    accessibilityIntent: "Identify the featured artist.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function artifact(
  id: string,
  kind: ArtifactRecord["kind"],
  overrides: Partial<ArtifactRecord> = {}
): ArtifactRecord {
  return {
    id,
    kind,
    version: 1,
    path: `.creative-preproduction/artifacts/${id}.md`,
    status: "approved",
    visibility: "project",
    assetIds: [],
    rationale: `Rationale for ${id}.`,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function approval(
  target: ArtifactRecord,
  overrides: Partial<ApprovalRecord> = {}
): ApprovalRecord {
  return {
    id: `${target.id}-v${target.version}-approval`,
    artifactId: target.id,
    artifactVersion: target.version,
    tier: "creative-lead",
    decision: "approved",
    reviewer: "Mina Shah",
    reason: "The exact artifact and version are ready.",
    createdAt: now,
    ...overrides
  };
}

function feedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: "condition-1",
    originalText: "Confirm the crop before handoff.",
    source: "Review notes",
    classifications: ["approval-condition"],
    interpretation: "The image crop remains conditional.",
    resolutionStatus: "open",
    resultingArtifactIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "review",
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

describe("asset provider and promotion policy", () => {
  it("limits unknown-rights assets to local HTML/SVG", () => {
    const unknownAsset = asset();

    expect(canUseAssetWithProvider(unknownAsset, "local-html-svg")).toEqual({
      allowed: true,
      reasons: []
    });
    expect(canUseAssetWithProvider(unknownAsset, "figma")).toEqual({
      allowed: false,
      reasons: ["Asset campaign-portrait has unknown rights and is limited to private local HTML/SVG studies."]
    });
  });

  it("requires recorded provider scope for cleared and restricted assets", () => {
    expect(canUseAssetWithProvider(asset({
      rightsStatus: "cleared",
      providerScopes: ["figma"],
      storage: { kind: "managed", path: "public/portrait.jpg" }
    }), "figma")).toEqual({ allowed: true, reasons: [] });

    expect(canUseAssetWithProvider(asset({
      rightsStatus: "restricted",
      providerScopes: [],
      storage: { kind: "managed", path: "assets/portrait.jpg" }
    }), "figma")).toEqual({
      allowed: false,
      reasons: ["Asset campaign-portrait is not permitted for provider figma."]
    });
  });

  it("blocks non-deliverable, locked-treatment, private, and unknown-rights promotion independently", () => {
    const study = artifact("study", "composition-study", {
      status: "provisional",
      visibility: "private",
      assetIds: ["campaign-portrait", "locked-mark", "mood-reference"],
      provider: "local-html-svg",
      question: "What visual treatment works?",
      assumptions: [],
      blockers: []
    });
    const project = manifest({
      artifacts: [study],
      assets: [
        asset(),
        asset({
          id: "locked-mark",
          modificationPolicy: "locked",
          rightsStatus: "cleared",
          providerScopes: ["local-html-svg"],
          storage: { kind: "managed", path: "public/mark.svg" },
          allowedTreatments: ["recolor"]
        }),
        asset({
          id: "mood-reference",
          modificationPolicy: "inspiration-only",
          rightsStatus: "cleared",
          providerScopes: ["local-html-svg"],
          storage: { kind: "managed", path: "references/mood.jpg" }
        })
      ]
    });

    expect(canPromoteArtifact(project, study)).toEqual({
      allowed: false,
      reasons: [
        "Asset campaign-portrait has unknown rights and cannot be promoted.",
        "Asset campaign-portrait uses private storage and cannot be referenced by a project-visible artifact.",
        "Asset locked-mark is locked and cannot declare treatment changes.",
        "Asset mood-reference is inspiration-only and cannot be used in a deliverable."
      ]
    });
  });

  it("does not let an omitted promotion provider bypass restricted provider scope", () => {
    const study = artifact("study", "composition-study", {
      status: "provisional",
      visibility: "private",
      assetIds: ["campaign-portrait"],
      provider: undefined,
      question: "Can this asset support the direction?",
      assumptions: [],
      blockers: []
    });
    const project = manifest({
      artifacts: [study],
      assets: [asset({
        rightsStatus: "restricted",
        providerScopes: [],
        storage: { kind: "managed", path: "assets/campaign-portrait.jpg" }
      })]
    });

    expect(canPromoteArtifact(project, study)).toEqual({
      allowed: false,
      reasons: ["Asset campaign-portrait is not permitted for provider local-html-svg."]
    });
  });

  it.each([
    {
      name: "unknown rights in Figma",
      asset: asset(),
      reason: "Asset campaign-portrait has unknown rights and is limited to private local HTML/SVG studies."
    },
    {
      name: "restricted rights without Figma scope",
      asset: asset({
        rightsStatus: "restricted",
        providerScopes: [],
        storage: { kind: "managed", path: "assets/campaign-portrait.jpg" }
      }),
      reason: "Asset campaign-portrait is not permitted for provider figma."
    }
  ])("validates provider eligibility for private studies with $name", ({ asset: suppliedAsset, reason }) => {
    const study = artifact("study", "composition-study", {
      status: "provisional",
      visibility: "private",
      assetIds: [suppliedAsset.id],
      provider: "figma",
      question: "Can this asset support the direction?",
      assumptions: [],
      blockers: []
    });

    expect(evaluateManifestPolicy(manifest({ artifacts: [study], assets: [suppliedAsset] })))
      .toContainEqual({
        code: "asset-provider-blocked",
        subjectId: suppliedAsset.id,
        message: reason
      });
  });
});

describe("decision-owner and handoff policy", () => {
  it("requires the configured owner rather than a higher approval tier", () => {
    const visualLanguage = artifact("visual-language", "visual-language");
    const project = manifest({
      participants: [
        { id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now },
        { id: "alex-chen", name: "Alex Chen", role: "stakeholder", createdAt: now }
      ],
      decisionOwners: [{ area: "creative-direction", participantId: "mina-shah" }],
      artifacts: [visualLanguage],
      approvals: [approval(visualLanguage, { tier: "stakeholder", reviewer: "Alex Chen", reviewerId: "alex-chen" })]
    });

    expect(hasDecisionOwnerApproval(project, visualLanguage, "creative-direction")).toBe(false);
    expect(hasDecisionOwnerApproval({
      ...project,
      approvals: [...project.approvals, approval(visualLanguage, { reviewerId: "mina-shah" })]
    }, visualLanguage, "creative-direction")).toBe(true);
    expect(hasDecisionOwnerApproval({
      ...project,
      approvals: [
        ...project.approvals,
        approval(visualLanguage, { reviewerId: "mina-shah", createdAt: "2026-09-17T19:00:00.000Z" }),
        approval(visualLanguage, {
          decision: "returned",
          reviewerId: "alex-chen",
          createdAt: "2026-09-17T20:00:00.000Z"
        })
      ]
    }, visualLanguage, "creative-direction")).toBe(false);
    expect(hasDecisionOwnerApproval({ ...project, decisionOwners: [] }, visualLanguage, "creative-direction"))
      .toBe(true);
  });

  it("reports each open condition, conflict, exact-study owner requirement, and handoff integrity blocker", () => {
    const handoff = artifact("handoff", "implementation-handoff", {
      assetIds: ["campaign-portrait"]
    });
    const study = artifact("private-study", "composition-study", {
      status: "provisional",
      visibility: "private",
      path: ".creative-preproduction/private/studies/private-study/v1/index.html",
      question: "Can this direction work?",
      assumptions: [],
      blockers: []
    });
    const project = manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }],
      decisionOwners: [
        { area: "creative-direction", participantId: "mina-shah" },
        { area: "implementation-readiness", participantId: "mina-shah" }
      ],
      artifacts: [handoff, study],
      approvals: [approval(handoff)],
      assets: [asset({
        rightsStatus: "restricted",
        providerScopes: ["figma"],
        storage: { kind: "managed", path: "assets/portrait.jpg" },
        relatedArtifactIds: ["private-study"]
      })],
      feedback: [
        feedback({ target: { kind: "artifact", id: "private-study", version: 1 } }),
        feedback({
          id: "conflict-1",
          classifications: ["unresolved-conflict"],
          originalText: "The stakeholders disagree.",
          interpretation: "A direction decision is required."
        })
      ]
    });

    expect(evaluateHandoffPolicy(project)).toEqual({
      allowed: false,
      reasons: [
        "Feedback condition-1 remains an open approval condition.",
        "Feedback conflict-1 remains an unresolved conflict.",
        "Artifact private-study v1 requires approval from creative-direction owner mina-shah.",
        "Artifact handoff v1 requires approval from implementation-readiness owner mina-shah.",
        "Implementation handoff handoff references provisional or private artifact private-study v1.",
        "Asset campaign-portrait is not permitted for provider local-html-svg."
      ]
    });
  });

  it("does not require creative-owner approval for routine draft work", () => {
    const draft = artifact("decision-journal", "decision-journal", { status: "draft" });
    expect(evaluateHandoffPolicy(manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }],
      decisionOwners: [{ area: "creative-direction", participantId: "mina-shah" }],
      artifacts: [draft]
    }))).toEqual({ allowed: true, reasons: [] });
  });
});
