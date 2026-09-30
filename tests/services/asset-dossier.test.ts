import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetRecord, ProjectManifest } from "../../src/domain/schema.js";
import { renderAssetDossier, writeAssetDossier } from "../../src/services/asset-dossier.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const now = "2026-09-17T18:00:00.000Z";

function manifest(): ProjectManifest {
  const asset: AssetRecord = {
    id: "campaign-portrait",
    title: "Campaign portrait",
    creator: "Grounds creative team",
    source: "Original source: private-portrait-final.jpg",
    creativeOwner: "mina-shah",
    intendedRole: "Primary home-page story image",
    modificationPolicy: "adaptable",
    rightsStatus: "unknown",
    providerScopes: ["local-html-svg"],
    storage: { kind: "private", ref: "secret-handoff-01" },
    allowedTreatments: ["responsive crop"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third" },
    responsiveGuidance: "Protect the face below 620px.",
    accessibilityIntent: "Informative portrait identifying the featured artist.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: ["Can the portrait be used in paid placements?"],
    createdAt: now,
    updatedAt: now
  };
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "brief",
    participants: [],
    decisionOwners: [],
    artifacts: [],
    approvals: [],
    assets: [asset, { ...asset, id: "archive-logo", title: "Archive logo" }],
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("asset dossier", () => {
  it("renders assets by ID with their creative and rights guidance while omitting private source details", () => {
    const dossier = renderAssetDossier(manifest());

    expect(dossier.indexOf("archive-logo")).toBeLessThan(dossier.indexOf("campaign-portrait"));
    expect(dossier).toContain("Primary home-page story image");
    expect(dossier).toContain("mina-shah");
    expect(dossier).toContain("adaptable");
    expect(dossier).toContain("unknown");
    expect(dossier).toContain("local-html-svg");
    expect(dossier).toContain("responsive crop");
    expect(dossier).toContain("generative extension");
    expect(dossier).toContain("Protect the face below 620px.");
    expect(dossier).toContain("Informative portrait identifying the featured artist.");
    expect(dossier).toContain("Face in right third");
    expect(dossier).toContain("Can the portrait be used in paid placements?");
    expect(dossier).not.toContain("secret-handoff-01");
    expect(dossier).not.toContain("private-portrait-final.jpg");
  });

  it("orders visual-note labels by code point", () => {
    const project = manifest();
    project.assets[0] = {
      ...project.assets[0]!,
      visualNotes: { "äudience": "Umlaut heading", zIndex: "ASCII heading" }
    };

    const dossier = renderAssetDossier(project);

    expect(dossier.indexOf("zIndex: ASCII heading"))
      .toBeLessThan(dossier.indexOf("äudience: Umlaut heading"));
  });

  it("orders astral and BMP visual-note labels by Unicode code point", () => {
    const project = manifest();
    project.assets[0] = {
      ...project.assets[0]!,
      visualNotes: { "\u{10000}": "Astral heading", "\uE000": "BMP heading" }
    };

    const dossier = renderAssetDossier(project);

    expect(dossier.indexOf("\uE000: BMP heading"))
      .toBeLessThan(dossier.indexOf("\u{10000}: Astral heading"));
  });

  it("writes the dossier atomically into an initialized project", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    await initializeProject({ root, id: "civic-arts", name: "Civic Arts", kind: "new-site" });
    await new ProjectStore(root).save(manifest());
    await writeFile(join(root, ".creative-preproduction", "asset-dossier.md"), "is recorded here as assets are registered");

    await writeAssetDossier(root, manifest());

    const written = await readFile(join(root, ".creative-preproduction", "asset-dossier.md"), "utf8");
    expect(written).toContain("Campaign portrait");
    expect(written).not.toContain("is recorded here as assets are registered");
  });

  it("rejects a competing dossier write while the first writer holds the lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const firstWriteStarted = deferred();
    const releaseFirstWrite = deferred();
    vi.mocked(writeFile).mockImplementationOnce(async (path, data, options) => {
      firstWriteStarted.resolve();
      await releaseFirstWrite.promise;
      await actual.writeFile(path, data, options);
    });

    const first = writeAssetDossier(root, manifest());
    await firstWriteStarted.promise;

    await expect(writeAssetDossier(root, manifest()))
      .rejects.toThrow(/another writer is updating/i);
    releaseFirstWrite.resolve();
    await first;
  });

  it("initializes an asset dossier template", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));

    await initializeProject({ root, id: "civic-arts", name: "Civic Arts", kind: "new-site" });

    expect(await readFile(join(root, ".creative-preproduction", "asset-dossier.md"), "utf8"))
      .toContain("Asset Dossier");
  });
});
