import { describe, expect, it } from "vitest";
import { ArtifactRecordSchema, type AssetRecord, type ProjectManifest } from "../../src/domain/schema.js";
import { recordApproval } from "../../src/services/artifacts.js";
import {
  createProvisionalArtifact,
  promoteProvisionalArtifact
} from "../../src/services/provisional.js";

const now = "2026-09-17T18:00:00.000Z";

function asset(rightsStatus: AssetRecord["rightsStatus"]): AssetRecord {
  return {
    id: "campaign-portrait",
    title: "Campaign portrait",
    source: "Client handoff",
    intendedRole: "Home-page lead image",
    modificationPolicy: "adaptable",
    rightsStatus,
    providerScopes: ["local-html-svg"],
    storage: rightsStatus === "unknown"
      ? { kind: "private", ref: "campaign-portrait" }
      : { kind: "managed", path: "public/images/campaign-portrait.jpg" },
    allowedTreatments: ["responsive crop"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third" },
    responsiveGuidance: "Protect the face on narrow screens.",
    accessibilityIntent: "Identify the featured artist.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

function manifest(rightsStatus: AssetRecord["rightsStatus"]): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "exploration",
    participants: [],
    decisionOwners: [],
    artifacts: [],
    approvals: [],
    assets: [asset(rightsStatus)],
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

function provisional() {
  return createProvisionalArtifact({
    id: "home-composition",
    kind: "composition-study",
    path: ".creative-preproduction/private/studies/home-composition/v1/index.html",
    question: "Can the portrait and event program share the opening frame?",
    rationale: "Tests editorial tension before the direction is approved.",
    assumptions: ["The portrait can crop to 4:5."],
    blockers: ["Portrait rights are not yet confirmed."],
    assetIds: ["campaign-portrait"],
    provider: "local-html-svg",
    now: new Date(now)
  });
}

describe("provisional artifacts", () => {
  it("creates a schema-valid private provisional record with decision context and lineage", () => {
    expect(provisional()).toEqual({
      id: "home-composition",
      kind: "composition-study",
      version: 1,
      path: ".creative-preproduction/private/studies/home-composition/v1/index.html",
      status: "provisional",
      visibility: "private",
      question: "Can the portrait and event program share the opening frame?",
      rationale: "Tests editorial tension before the direction is approved.",
      assumptions: ["The portrait can crop to 4:5."],
      blockers: ["Portrait rights are not yet confirmed."],
      assetIds: ["campaign-portrait"],
      provider: "local-html-svg",
      createdAt: now,
      updatedAt: now
    });
  });

  it("requires provisional decision context in the artifact schema", () => {
    const complete = provisional();
    for (const field of ["question", "assumptions", "blockers"] as const) {
      const { [field]: _omitted, ...incomplete } = complete;
      expect(() => ArtifactRecordSchema.parse(incomplete)).toThrow(/provisional/i);
    }
    expect(() => ArtifactRecordSchema.parse({ ...complete, visibility: "project" }))
      .toThrow(/provisional/i);
  });

  it("rejects approval with the promotion-specific instruction", () => {
    expect(() => recordApproval({
      artifact: provisional(),
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reason: "Proceed."
    })).toThrow("Provisional artifacts cannot be approved; promote the work to a draft first.");
  });
});

describe("provisional promotion", () => {
  it.each([
    { modificationPolicy: "inspiration-only" as const },
    { storage: { kind: "private" as const, ref: "campaign-portrait" } },
    { providerScopes: ["figma" as const] },
    { modificationPolicy: "locked" as const }
  ])("rejects promotion forbidden by the complete asset policy: %j", (changes) => {
    const project = manifest("cleared");
    project.assets = [{ ...project.assets[0]!, ...changes }];
    const before = structuredClone(project);
    const source = provisional();
    expect(() => promoteProvisionalArtifact(source, project, {
      path: "direction/study-v2.html", rationale: "Ready for review."
    })).toThrow(/inspiration-only|private storage|not permitted|locked/i);
    expect(project).toEqual(before);
    expect(source).toEqual(provisional());
  });

  it("rejects promotion while a referenced asset has unknown rights", () => {
    expect(() => promoteProvisionalArtifact(provisional(), manifest("unknown"), {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "The study is ready for project review."
    })).toThrow(/campaign-portrait.*unknown rights/i);
  });

  it("promotes to a separate project-visible draft and preserves the source", () => {
    const source = provisional();

    const promoted = promoteProvisionalArtifact(source, manifest("cleared"), {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "Rights and responsive crop are confirmed.",
      now: new Date("2026-09-18T18:00:00Z")
    });

    expect(promoted).toMatchObject({
      id: source.id,
      version: source.version + 1,
      parentVersion: source.version,
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      status: "draft",
      visibility: "project",
      rationale: "Rights and responsive crop are confirmed.",
      createdAt: "2026-09-18T18:00:00.000Z",
      updatedAt: "2026-09-18T18:00:00.000Z"
    });
    expect(promoted).not.toHaveProperty("question");
    expect(promoted).not.toHaveProperty("assumptions");
    expect(promoted).not.toHaveProperty("blockers");
    expect(source).toEqual(provisional());
  });

  it("rejects unsafe, private, or colliding promotion paths", () => {
    const source = provisional();
    const cleared = manifest("cleared");
    const promote = (path: string) => promoteProvisionalArtifact(source, cleared, {
      path,
      rationale: "Ready for project review."
    });

    expect(() => promote("../outside.html")).toThrow(/safe project-relative path/i);
    expect(() => promote("C:\\outside.html")).toThrow(/safe project-relative path/i);
    expect(() => promote("D:\\outside.html")).toThrow(/safe project-relative path/i);
    expect(() => promote("C:outside.html")).toThrow(/safe project-relative path/i);
    expect(() => promote("artifacts/home.html:preview")).toThrow(/safe project-relative path/i);
    expect(() => promote(".creative-preproduction/private/promoted.html")).toThrow(/outside private workspace/i);
    expect(() => promote(source.path)).toThrow(/separate path/i);
  });

  it("rejects promotion when referenced asset lineage is missing from the manifest", () => {
    expect(() => promoteProvisionalArtifact(provisional(), { ...manifest("cleared"), assets: [] }, {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "Ready for project review."
    })).toThrow(/campaign-portrait.*does not exist/i);
  });

  it("rejects ambiguous asset identities before evaluating rights", () => {
    expect(() => promoteProvisionalArtifact(provisional(), {
      ...manifest("cleared"),
      assets: [asset("cleared"), asset("unknown")]
    }, {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "Ready for project review."
    })).toThrow(/campaign-portrait.*ambiguous/i);
  });

  it("rejects an occupied next version or normalized destination path", () => {
    const source = provisional();
    const nextVersion = {
      ...source,
      version: 2,
      parentVersion: 1,
      path: ".creative-preproduction/artifacts/other-v2.html",
      status: "draft" as const,
      visibility: "project" as const,
      question: undefined,
      assumptions: undefined,
      blockers: undefined
    };
    const occupiedPath = {
      ...nextVersion,
      id: "another-artifact",
      version: 1,
      parentVersion: undefined,
      path: ".creative-preproduction/artifacts/./home-composition-v2.html"
    };

    expect(() => promoteProvisionalArtifact(source, {
      ...manifest("cleared"),
      artifacts: [nextVersion]
    }, {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "Ready for project review."
    })).toThrow(/version 2.*already exists/i);
    expect(() => promoteProvisionalArtifact(source, {
      ...manifest("cleared"),
      artifacts: [occupiedPath]
    }, {
      path: ".creative-preproduction/artifacts/home-composition-v2.html",
      rationale: "Ready for project review."
    })).toThrow(/destination path.*already exists/i);
  });
});
