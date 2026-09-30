import { describe, expect, it } from "vitest";
import type { AssetRecord, ProjectManifest } from "../../src/domain/schema.js";
import { addAsset, createAsset, updateAsset } from "../../src/services/assets.js";
import { addParticipant } from "../../src/services/participants.js";

const now = "2026-09-17T18:00:00.000Z";

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
    createdAt: now,
    updatedAt: now
  };
}

type AssetOverrides = Partial<Pick<AssetRecord,
  "rightsStatus" | "storage" | "providerScopes" | "modificationPolicy" | "allowedTreatments"
>>;

function asset(overrides: AssetOverrides = {}): AssetRecord {
  return createAsset({
    id: "campaign-portrait",
    title: "Campaign portrait",
    creator: "Grounds creative team",
    source: "Creative handoff 2026-09-17",
    creativeOwner: "mina-shah",
    intendedRole: "Primary home-page story image",
    modificationPolicy: "adaptable",
    rightsStatus: "cleared",
    providerScopes: ["local-html-svg", "figma"],
    storage: { kind: "managed", path: "public/images/campaign-portrait.jpg" },
    allowedTreatments: ["responsive crop", "subtle color overlay"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third", negativeSpace: "Open left field" },
    responsiveGuidance: "Protect the face; use a portrait crop below 620px.",
    accessibilityIntent: "Informative portrait identifying the featured artist.",
    unresolvedQuestions: [],
    now: new Date(now),
    ...overrides
  });
}

describe("asset invariants", () => {
  it.each([
    ".creative-preproduction/private/assets/portrait/source",
    "./.creative-preproduction//private/assets/portrait/source",
    ".creative-preproduction\\private\\assets\\portrait\\source",
    ".creative-preproduction/PRIVATE/assets/portrait/source"
  ])("rejects a managed path inside the private workspace: %s", (path) => {
    expect(() => asset({ storage: { kind: "managed", path } })).toThrow(/private workspace/i);
    const existing = asset({ rightsStatus: "unknown", providerScopes: ["local-html-svg"],
      storage: { kind: "private", ref: "portrait" } });
    const project = { ...manifest(), assets: [existing] };
    const before = structuredClone(project);
    expect(() => updateAsset(project, existing.id, {
      rightsStatus: "cleared", storage: { kind: "managed", path }, providerScopes: ["figma"]
    })).toThrow(/private workspace/i);
    expect(() => addAsset(manifest(), { ...existing, rightsStatus: "cleared",
      storage: { kind: "managed", path } })).toThrow(/private workspace/i);
    expect(project).toEqual(before);
  });

  it("requires unknown-rights assets to use private opaque storage and local HTML/SVG scope", () => {
    expect(() => asset({
      rightsStatus: "unknown",
      storage: { kind: "managed", path: "public/images/campaign-portrait.jpg" }
    })).toThrow(/unknown-rights.*private storage/i);
    expect(() => asset({
      rightsStatus: "unknown",
      storage: { kind: "private", ref: "handoff-asset-01" },
      providerScopes: ["figma"]
    })).toThrow(/unknown-rights.*local html\/svg/i);
    expect(asset({
      rightsStatus: "unknown",
      storage: { kind: "private", ref: "handoff-asset-01" },
      providerScopes: ["local-html-svg"]
    }).storage).toEqual({ kind: "private", ref: "handoff-asset-01" });
  });

  it("allows project-relative managed paths and rejects absolute managed paths", () => {
    expect(asset().storage).toEqual({ kind: "managed", path: "public/images/campaign-portrait.jpg" });
    expect(() => asset({
      storage: { kind: "managed", path: "C:\\assets\\campaign-portrait.jpg" }
    })).toThrow(/project-relative/i);
  });

  it("rejects allowed treatments for locked assets", () => {
    expect(() => asset({ modificationPolicy: "locked" }))
      .toThrow(/locked assets cannot declare allowed modifications/i);
  });

  it("normalizes an empty restricted provider scope to a local HTML/SVG study", () => {
    expect(asset({ rightsStatus: "restricted", providerScopes: [] }).providerScopes)
      .toEqual(["local-html-svg"]);
  });
});

describe("asset mutations", () => {
  it("preserves createdAt and changes updatedAt when an asset is updated", () => {
    const withOwner = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    });
    const withAsset = addAsset(withOwner, asset());

    const updated = updateAsset(withAsset, "campaign-portrait", {
      title: "Updated campaign portrait"
    }, new Date("2026-09-18T18:00:00Z"));

    expect(updated.assets[0]).toMatchObject({
      title: "Updated campaign portrait",
      createdAt: now,
      updatedAt: "2026-09-18T18:00:00.000Z"
    });
    expect(withAsset.assets[0]?.title).toBe("Campaign portrait");
  });

  it("rejects duplicate asset IDs and an unknown creative owner", () => {
    const withOwner = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    });
    const withAsset = addAsset(withOwner, asset());

    expect(() => addAsset(withAsset, asset())).toThrow(/asset.*already exists/i);
    expect(() => addAsset(manifest(), asset())).toThrow(/creative owner.*participant/i);
  });

  it("normalizes a restricted asset's empty provider scope when it is registered", () => {
    const withOwner = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    });
    const unnormalized = {
      ...asset(),
      rightsStatus: "restricted" as const,
      providerScopes: []
    };

    expect(addAsset(withOwner, unnormalized).assets[0]?.providerScopes)
      .toEqual(["local-html-svg"]);
  });

  it("revalidates merged fields before persisting an update", () => {
    const withOwner = addParticipant(manifest(), {
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead"
    });
    const withAsset = addAsset(withOwner, asset());

    expect(() => updateAsset(withAsset, "campaign-portrait", {
      modificationPolicy: "locked"
    })).toThrow(/locked assets cannot declare allowed modifications/i);
  });
});
