import { chmod, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetRecord, ProjectManifest } from "../../src/domain/schema.js";
import { createPrivateHtmlStudy } from "../../src/providers/html-svg.js";
import { PrivateWorkspace } from "../../src/storage/private-workspace.js";

const now = "2026-09-17T18:00:00.000Z";

function privateAsset(): AssetRecord {
  return {
    id: "campaign-portrait",
    title: "Campaign <Portrait>",
    creator: "Grounds & Co.",
    source: "Client handoff <restricted>",
    intendedRole: "Primary home-page story image",
    modificationPolicy: "adaptable",
    rightsStatus: "unknown",
    providerScopes: ["local-html-svg"],
    storage: { kind: "private", ref: "campaign-portrait" },
    allowedTreatments: ["responsive crop"],
    prohibitedTreatments: ["generative extension"],
    visualNotes: { focalPoint: "Face in right third" },
    responsiveGuidance: "Protect the face; portrait crop below 620px.",
    accessibilityIntent: "Identify the featured artist.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: ["Confirm publication rights."],
    createdAt: now,
    updatedAt: now
  };
}

function manifest(assets: AssetRecord[]): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "exploration",
    participants: [],
    decisionOwners: [],
    artifacts: [],
    approvals: [],
    assets,
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

describe("createPrivateHtmlStudy", () => {
  it("rejects a Figma-only asset before workspace creation and preserves the manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));
    const restricted = { ...privateAsset(), id: "figma-only", rightsStatus: "restricted" as const,
      providerScopes: ["figma" as const], storage: { kind: "managed" as const, path: "portrait.jpg" } };
    await writeFile(join(root, "portrait.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    const project = manifest([privateAsset(), restricted]);
    const before = structuredClone(project);
    const files = await readdir(root, { recursive: true });
    await expect(createPrivateHtmlStudy(root, project, {
      id: "denied", title: "Denied study", question: "Can this run locally?", rationale: "Test provider scope.",
      assumptions: [], assetIds: ["campaign-portrait", "figma-only"], compositionNotes: []
    })).rejects.toThrow(/figma-only.*not permitted.*local-html-svg/i);
    expect(project).toEqual(before);
    expect(await readdir(root, { recursive: true })).toEqual(files);
    expect(await readFile(join(root, "portrait.jpg"))).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("writes a private local-only responsive study with escaped decision and asset guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));
    const source = join(root, "original-client-filename.jpg");
    await writeFile(source, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();
    await workspace.importFile("campaign-portrait", source);

    const result = await createPrivateHtmlStudy(root, manifest([privateAsset()]), {
      id: "home-composition",
      title: "Opening <Frame>",
      question: "Can portrait & program share the opening frame?",
      rationale: "Tests <editorial> tension before approval.",
      assumptions: ["Portrait crops to 4:5.", "No <script src='https://bad.example/x.js'></script> content."],
      assetIds: ["campaign-portrait"],
      compositionNotes: ["Keep the image dominant above 720px."],
      now: new Date(now)
    });

    expect(result.artifact).toMatchObject({
      id: "home-composition",
      kind: "composition-study",
      version: 1,
      status: "provisional",
      visibility: "private",
      provider: "local-html-svg",
      assetIds: ["campaign-portrait"]
    });
    expect(result.previewPath).toBe(
      ".creative-preproduction/private/studies/home-composition/v1/index.html"
    );
    expect(result.artifact.path).toBe(result.previewPath);
    const html = await readFile(join(root, result.previewPath), "utf8");
    expect(html).toContain("PRIVATE PROVISIONAL STUDY");
    expect(html).toContain("Can portrait &amp; program share the opening frame?");
    expect(html).toContain("Tests &lt;editorial&gt; tension before approval.");
    expect(html).toContain("Portrait crops to 4:5.");
    expect(html).toContain("Keep the image dominant above 720px.");
    expect(html).toContain("Protect the face; portrait crop below 620px.");
    expect(html).toContain("Client handoff &lt;restricted&gt;");
    expect(html).toContain("../../../assets/campaign-portrait/source");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain("@media (max-width: 720px)");
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/(?:src|href)=["']\/\//i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<link\b[^>]*rel=["']stylesheet/i);
    expect(html).not.toContain(root);
    expect(html).not.toContain("original-client-filename.jpg");
  });

  it("uses an inline SVG fallback when a referenced local asset cannot be rendered", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));

    const result = await createPrivateHtmlStudy(root, manifest([privateAsset()]), {
      id: "fallback-study",
      title: "Fallback study",
      question: "Does the structure work before the asset arrives?",
      rationale: "Tests layout without inventing an external resource.",
      assumptions: [],
      assetIds: ["campaign-portrait"],
      compositionNotes: [],
      now: new Date(now)
    });

    const html = await readFile(join(root, result.previewPath), "utf8");
    expect(html).toContain('<svg class="asset-fallback"');
    expect(html).toContain("Local preview unavailable");
  });

  it("uses fallback graphics for directories and unsupported existing files", async () => {
    for (const nodeKind of ["directory", "unsupported-file"] as const) {
      const root = await mkdtemp(join(tmpdir(), "creative-study-"));
      const sourcePath = join(
        root,
        ".creative-preproduction",
        "private",
        "assets",
        "campaign-portrait",
        "source"
      );
      if (nodeKind === "directory") {
        await mkdir(sourcePath, { recursive: true });
      } else {
        await mkdir(join(sourcePath, ".."), { recursive: true });
        await writeFile(sourcePath, "plain text, not an image", "utf8");
      }

      const result = await createPrivateHtmlStudy(root, manifest([privateAsset()]), {
        id: `${nodeKind}-study`,
        title: "Fallback study",
        question: "Does the fallback remain local?",
        rationale: "Tests non-renderable local nodes.",
        assumptions: [],
        assetIds: ["campaign-portrait"],
        compositionNotes: [],
        now: new Date(now)
      });

      const html = await readFile(join(root, result.previewPath), "utf8");
      expect(html).toContain('<svg class="asset-fallback"');
      expect(html).not.toContain('<img src="../../../assets/campaign-portrait/source"');
    }
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "uses fallback graphics for an unreadable local file",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "creative-study-"));
      const sourcePath = join(
        root,
        ".creative-preproduction",
        "private",
        "assets",
        "campaign-portrait",
        "source"
      );
      await mkdir(join(sourcePath, ".."), { recursive: true });
      await writeFile(sourcePath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
      await chmod(sourcePath, 0o000);
      try {
        const result = await createPrivateHtmlStudy(root, manifest([privateAsset()]), {
          id: "unreadable-study",
          title: "Unreadable fallback",
          question: "Does an unreadable image fall back?",
          rationale: "Tests read permissions.",
          assumptions: [],
          assetIds: ["campaign-portrait"],
          compositionNotes: [],
          now: new Date(now)
        });
        expect(await readFile(join(root, result.previewPath), "utf8"))
          .toContain('<svg class="asset-fallback"');
      } finally {
        await chmod(sourcePath, 0o600);
      }
    }
  );

  it("rejects unknown asset IDs and refuses to overwrite an existing study", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));
    const input = {
      id: "home-composition",
      title: "Opening frame",
      question: "Can the opening balance both stories?",
      rationale: "Tests the composition.",
      assumptions: [],
      assetIds: ["campaign-portrait"],
      compositionNotes: [],
      now: new Date(now)
    };

    await expect(createPrivateHtmlStudy(root, manifest([]), input))
      .rejects.toThrow(/campaign-portrait.*does not exist/i);
    expect(await createPrivateHtmlStudy(root, manifest([privateAsset()]), input)).toMatchObject({ ownership: "created" });
    await expect(createPrivateHtmlStudy(root, manifest([privateAsset()]), { ...input, title: "Different bytes" }))
      .rejects.toThrow(/already exists/i);
    await expect(createPrivateHtmlStudy(root, manifest([privateAsset()]), input)).resolves.toMatchObject({
      ownership: "reused",
      previewPath: ".creative-preproduction/private/studies/home-composition/v1/index.html"
    });
    expect(await readdir(join(root, ".creative-preproduction", "private", "studies", "home-composition", "v1")))
      .toEqual(["index.html"]);
  });

  it("allows exactly one concurrent preview writer and preserves the winning document", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));
    await new PrivateWorkspace(root).initialize();
    const base = {
      id: "home-composition",
      question: "Can the opening balance both stories?",
      rationale: "Tests the composition.",
      assumptions: [],
      assetIds: ["campaign-portrait"],
      compositionNotes: [],
      now: new Date(now)
    };

    const results = await Promise.allSettled([
      createPrivateHtmlStudy(root, manifest([privateAsset()]), { ...base, title: "First complete study" }),
      createPrivateHtmlStudy(root, manifest([privateAsset()]), { ...base, title: "Second complete study" })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const html = await readFile(
      join(root, ".creative-preproduction", "private", "studies", "home-composition", "v1", "index.html"),
      "utf8"
    );
    expect(html).toMatch(/(?:First|Second) complete study/);
    expect(html).toContain("</html>");
    expect(await readdir(join(root, ".creative-preproduction", "private", "studies", "home-composition", "v1")))
      .toEqual(["index.html"]);
  });

  it("rejects a linked study ancestor instead of publishing outside the private workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-study-"));
    const outside = await mkdtemp(join(tmpdir(), "creative-study-outside-"));
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();
    try {
      await symlink(
        outside,
        join(root, ".creative-preproduction", "private", "studies"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error: unknown) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        return;
      }
      throw error;
    }

    await expect(createPrivateHtmlStudy(root, manifest([privateAsset()]), {
      id: "linked-study",
      title: "Linked study",
      question: "Will this stay private?",
      rationale: "Tests linked ancestor rejection.",
      assumptions: [],
      assetIds: ["campaign-portrait"],
      compositionNotes: [],
      now: new Date(now)
    })).rejects.toThrow(/linked ancestor/i);
    expect(await readdir(outside)).toEqual([]);
  });
});
