import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { PrivateWorkspace } from "../../src/storage/private-workspace.js";
import { canUseAssetWithProvider } from "../../src/domain/policy.js";
import { validateProject } from "../../src/services/validation.js";
import type { AssetRecord } from "../../src/domain/schema.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});

async function failManifestPublication(root: string): Promise<void> {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  let failed = false;
  vi.mocked(rename).mockImplementation(async (from, to) => {
    if (!failed && String(to) === join(root, ".creative-preproduction", "manifest.json")) {
      failed = true;
      throw new Error("injected manifest save failure");
    }
    return actual.rename(from, to);
  });
}

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "creative-collaboration-cli-"));
  roots.push(root);
  await initializeProject({
    root,
    id: "civic-arts",
    name: "Civic Arts",
    kind: "new-site",
    now: new Date("2026-09-17T18:00:00.000Z")
  });
  return root;
}

async function runCli(...arguments_: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  await createProgram().parseAsync(["node", "creative-preproduction", ...arguments_]);
  return output.join("");
}

function assetAddArguments(root: string, options: {
  id?: string;
  rights?: "cleared" | "restricted" | "unknown";
  provider?: string;
  path: string;
}): string[] {
  return [
    "asset", "add", "--root", root,
    "--id", options.id ?? "campaign-portrait", "--title", "Campaign portrait", "--source", "Client handoff",
    "--role", "Home-page lead", "--modification", "adaptable", "--rights", options.rights ?? "cleared",
    "--provider", options.provider ?? "local-html-svg",
    "--path", options.path, "--allow", "responsive crop", "--prohibit", "generative extension",
    "--responsive", "Keep the face visible on small screens.", "--accessibility", "Identifies the featured artist."
  ];
}

describe("collaboration CLI", () => {
  it.each([
    ["inspiration-only", { modificationPolicy: "inspiration-only" }],
    ["private storage", { storage: { kind: "private", ref: "campaign-portrait" } }],
    ["provider-disallowed", { providerScopes: ["figma"] }],
    ["unscoped", { providerScopes: [] }]
  ] satisfies [string, Partial<AssetRecord>][])("rejects %s promotion without changing files or manifest", async (_label, changes) => {
    const root = await projectRoot();
    await runCli(...assetAddArguments(root, { path: "portrait.jpg" }));
    await runCli("explore-private", "--root", root, "--id", "study", "--title", "Study",
      "--question", "Does the opening work?", "--rationale", "Compare the opening.", "--asset", "campaign-portrait");
    const store = new ProjectStore(root);
    const project = await store.load();
    await store.save({ ...project, assets: [{ ...project.assets[0]!, ...changes }] });
    await writeFile(join(root, "reviewed.html"), "reviewed output");
    const before = await readFile(join(root, ".creative-preproduction/manifest.json"), "utf8");
    const preview = join(root, ".creative-preproduction/private/studies/study/v1/index.html");
    const source = await readFile(preview, "utf8");
    const files = await readdir(root, { recursive: true });
    await expect(runCli("promote", "--root", root, "--artifact", "study", "--version", "1",
      "--path", "reviewed.html", "--rationale", "Ready for review."))
      .rejects.toThrow(/inspiration-only|private storage|not permitted/i);
    expect(await readFile(join(root, ".creative-preproduction/manifest.json"), "utf8")).toBe(before);
    expect(await readFile(join(root, "reviewed.html"), "utf8")).toBe("reviewed output");
    expect(await readFile(preview, "utf8")).toBe(source);
    expect(await readdir(root, { recursive: true })).toEqual(files);
  });

  it("rejects private exploration when a restricted asset only permits Figma", async () => {
    const root = await projectRoot();
    await runCli(...assetAddArguments(root, { rights: "restricted", path: "portrait.jpg", provider: "figma" }));
    const before = await new ProjectStore(root).load();
    const files = await readdir(root, { recursive: true });
    await expect(runCli("explore-private", "--root", root, "--id", "denied", "--title", "Denied",
      "--question", "Is local use permitted?", "--rationale", "Check provider policy.", "--asset", "campaign-portrait"))
      .rejects.toThrow(/campaign-portrait.*not permitted.*local-html-svg/i);
    expect(await new ProjectStore(root).load()).toEqual(before);
    expect(await readdir(root, { recursive: true })).toEqual(files);
  });

  it.each(["direct", "linked", "missing-leaf"])("rejects relabeling private content through a %s managed path", async (kind) => {
    const root = await projectRoot();
    const source = join(root, "supplied.jpg");
    await writeFile(source, "private original");
    await runCli(...assetAddArguments(root, { rights: "unknown", path: source }));
    const privateRoot = join(root, ".creative-preproduction", "private");
    if (kind !== "direct") await symlink(privateRoot, join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
    const path = kind === "direct" ? ".creative-preproduction/private/assets/campaign-portrait/source"
      : kind === "linked" ? "alias/assets/campaign-portrait/source" : "alias/not-yet-published.jpg";
    const store = new ProjectStore(root);
    const before = await store.load();
    const files = await readdir(root, { recursive: true });
    await expect(runCli("asset", "update", "--id", "campaign-portrait", "--rights", "cleared",
      "--provider", "figma", "--path", path, "--root", root)).rejects.toThrow(/private workspace/i);
    await expect(runCli(...assetAddArguments(root, { id: "relabeled", path }))).rejects.toThrow(/private workspace/i);
    expect(await store.load()).toEqual(before);
    expect(await readdir(root, { recursive: true })).toEqual(files);
    expect(canUseAssetWithProvider((await store.load()).assets[0]!, "figma").allowed).toBe(false);
    expect(await readFile(join(privateRoot, "assets/campaign-portrait/source"), "utf8")).toBe("private original");
    const forged = { ...before, assets: [{ ...before.assets[0]!, rightsStatus: "cleared" as const,
      storage: { kind: "managed" as const, path } }] };
    expect(await validateProject(root, forged)).toContainEqual(expect.objectContaining({
      code: "tracked-path-unsafe", severity: "error", subjectId: "campaign-portrait"
    }));
  });

  it.each(["created", "reused"])("preserves an existing managed asset's private source when failed import %s it", async (ownership) => {
    const root = await projectRoot();
    const path = ".creative-preproduction/private/assets/portrait/source";
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    if (ownership === "reused") await writeFile(target, "original image");
    await runCli(...assetAddArguments(root, { id: "existing", path: "public/portrait.jpg" }));
    // Preserve cleanup coverage for legacy manifests that already contain the invalid label.
    const legacyStore = new ProjectStore(root);
    const legacy = await legacyStore.load();
    await legacyStore.save({ ...legacy, assets: legacy.assets.map((asset) => ({
      ...asset, storage: { kind: "managed", path }
    })) });
    const source = join(root, "supplied.jpg");
    await writeFile(source, "original image");
    await failManifestPublication(root);
    await expect(runCli(...assetAddArguments(root, { id: "portrait", rights: "unknown", path: source })))
      .rejects.toThrow("injected manifest save failure");
    const manifest = await new ProjectStore(root).load();
    expect(manifest.assets.map(({ id }) => id)).toEqual(["existing"]);
    expect(manifest.assets[0]?.storage).toEqual({ kind: "managed", path });
    expect(await readFile(target, "utf8")).toBe("original image");
    await expect(runCli(...assetAddArguments(root, { id: "portrait", rights: "unknown", path: source })))
      .resolves.toContain("Added asset portrait");
  });

  it.skipIf(process.platform !== "win32").each(["created", "reused"])(
    "preserves an approved Windows path alias when failed preview publication %s its file", async (ownership) => {
      const root = await projectRoot();
      await runCli(...assetAddArguments(root, { path: "public/portrait.jpg" }));
      const args = ["explore-private", "--root", root, "--id", "opening-study", "--title", "Opening study",
        "--question", "Lead?", "--rationale", "Explore", "--asset", "campaign-portrait"];
      await runCli(...args);
      const store = new ProjectStore(root);
      const manifest = await store.load();
      const preview = join(root, manifest.artifacts[0]!.path);
      const bytes = await readFile(preview);
      const artifact = { ...manifest.artifacts[0]!, id: "approved-study", status: "approved" as const,
        path: ".creative-preproduction/private/studies/opening-study/v1/INDEX.HTML" };
      await store.save({ ...manifest, artifacts: [artifact] });
      if (ownership === "created") await rm(preview);
      await failManifestPublication(root);
      await expect(runCli(...args)).rejects.toThrow("injected manifest save failure");
      expect((await new ProjectStore(root).load()).artifacts).toEqual([artifact]);
      expect(await readFile(join(root, artifact.path))).toEqual(bytes);
    }
  );

  it("persists participants and an imported unknown-rights asset without its source filename", async () => {
    const root = await projectRoot();
    const suppliedPath = join(root, "client-original-name.jpg");
    await writeFile(suppliedPath, Buffer.from([0xff, 0xd8, 0xff]));

    await expect(runCli(
      "participant", "add", "--root", root,
      "--id", "mina-shah", "--name", "Mina Shah", "--role", "creative-lead"
    )).resolves.toBe("Added participant mina-shah.\n");
    await expect(runCli(
      "participant", "own", "--root", root,
      "--area", "creative-direction", "--participant", "mina-shah"
    )).resolves.toBe("Assigned creative-direction to mina-shah.\n");
    await expect(runCli(
      "asset", "add", "--root", root,
      "--id", "campaign-portrait", "--title", "Campaign portrait", "--source", "Client handoff",
      "--role", "Home-page lead", "--modification", "adaptable", "--rights", "unknown",
      "--path", suppliedPath, "--provider", "local-html-svg", "--allow", "responsive crop",
      "--prohibit", "generative extension", "--responsive", "Keep the face visible on small screens.",
      "--accessibility", "Identifies the featured artist."
    )).resolves.toBe("Added asset campaign-portrait.\n");

    const manifest = await new ProjectStore(root).load();
    expect(manifest.participants).toEqual([{
      id: "mina-shah",
      name: "Mina Shah",
      role: "creative-lead",
      createdAt: expect.any(String)
    }]);
    expect(manifest.decisionOwners).toEqual([{ area: "creative-direction", participantId: "mina-shah" }]);
    expect(manifest.assets).toEqual([{
      id: "campaign-portrait",
      title: "Campaign portrait",
      source: "Client handoff",
      intendedRole: "Home-page lead",
      modificationPolicy: "adaptable",
      rightsStatus: "unknown",
      providerScopes: ["local-html-svg"],
      storage: { kind: "private", ref: "campaign-portrait" },
      allowedTreatments: ["responsive crop"],
      prohibitedTreatments: ["generative extension"],
      visualNotes: {},
      responsiveGuidance: "Keep the face visible on small screens.",
      accessibilityIntent: "Identifies the featured artist.",
      relatedArtifactIds: [],
      relatedFeedbackIds: [],
      unresolvedQuestions: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    }]);
    expect(JSON.stringify(manifest)).not.toContain("client-original-name.jpg");
    await expect(readFile(join(root, ".creative-preproduction", "private", "assets", "campaign-portrait", "source")))
      .resolves.toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    await expect(readFile(join(root, ".creative-preproduction", "asset-dossier.md"), "utf8"))
      .resolves.toContain("## campaign-portrait: Campaign portrait");

    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(join(root, "public", "campaign-portrait.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    await expect(runCli(
      "asset", "update", "--root", root, "--id", "campaign-portrait", "--rights", "cleared",
      "--provider", "manual", "--path", "public/campaign-portrait.jpg"
    )).resolves.toBe("Updated asset campaign-portrait.\n");
    expect((await new ProjectStore(root).load()).assets).toEqual([{
      id: "campaign-portrait",
      title: "Campaign portrait",
      source: "Client handoff",
      intendedRole: "Home-page lead",
      modificationPolicy: "adaptable",
      rightsStatus: "cleared",
      providerScopes: ["manual"],
      storage: { kind: "managed", path: "public/campaign-portrait.jpg" },
      allowedTreatments: ["responsive crop"],
      prohibitedTreatments: ["generative extension"],
      visualNotes: {},
      responsiveGuidance: "Keep the face visible on small screens.",
      accessibilityIntent: "Identifies the featured artist.",
      relatedArtifactIds: [],
      relatedFeedbackIds: [],
      unresolvedQuestions: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    }]);
  });

  it("preserves verbatim feedback and produces a source-prefixed question packet", async () => {
    const root = await projectRoot();
    const feedbackPath = join(root, "workshop-feedback.txt");
    const originalFeedback = "  Keep the crop wide.\nDo not fill the negative space.  ";
    await writeFile(feedbackPath, originalFeedback, "utf8");

    await expect(runCli("questions", "--root", root)).resolves.toBe(
      "Postures: lead\nNo unresolved creative questions.\n"
    );
    await expect(runCli("status", "--root", root)).resolves.toContain(
      "Participants: 0\nAssets: 0\nOpen feedback: 0\nProvisional artifacts: 0\n"
    );
    await expect(runCli(
      "feedback", "import", "--root", root,
      "--id", "opening-crop", "--file", feedbackPath, "--source", "Workshop notes",
      "--class", "question", "--class", "constraint", "--interpretation", "Protect the open left field.",
      "--target-kind", "project", "--target-id", "civic-arts"
    )).resolves.toBe("Imported feedback opening-crop.\n");
    await expect(runCli("questions", "--root", root)).resolves.toBe(
      "Postures: lead\n- feedback:opening-crop:   Keep the crop wide.\nDo not fill the negative space.  \n"
    );
    await expect(runCli(
      "feedback", "resolve", "--root", root,
      "--id", "opening-crop", "--resolution", "The composition keeps the left-side negative space.",
      "--artifact", "opening-study"
    )).resolves.toBe("Resolved feedback opening-crop.\n");

    const manifest = await new ProjectStore(root).load();
    expect(manifest.feedback).toEqual([{
      id: "opening-crop",
      originalText: originalFeedback,
      source: "Workshop notes",
      classifications: ["question", "constraint"],
      interpretation: "Protect the open left field.",
      target: { kind: "project", id: "civic-arts" },
      resolutionStatus: "resolved",
      resolution: "The composition keeps the left-side negative space.",
      resultingArtifactIds: ["opening-study"],
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    }]);
  });

  it("creates a private study, promotes only a supplied visible file, and records an explicit review", async () => {
    const root = await projectRoot();
    const managedAssetPath = join(root, "public", "portrait.jpg");
    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(managedAssetPath, Buffer.from([0xff, 0xd8, 0xff]));

    await runCli(
      "asset", "add", "--root", root,
      "--id", "campaign-portrait", "--title", "Campaign portrait", "--source", "Client handoff",
      "--role", "Home-page lead", "--modification", "adaptable", "--rights", "cleared",
      "--provider", "local-html-svg",
      "--path", "public/portrait.jpg", "--allow", "responsive crop", "--prohibit", "generative extension",
      "--responsive", "Keep the face visible on small screens.", "--accessibility", "Identifies the featured artist."
    );
    await expect(runCli(
      "explore-private", "--root", root,
      "--id", "opening-study", "--title", "Opening study", "--question", "Can the portrait lead?",
      "--rationale", "Test editorial hierarchy before approval.", "--asset", "campaign-portrait",
      "--assumption", "The portrait can crop to 4:5.", "--note", "Keep the image prominent."
    )).resolves.toBe(
      "Created private study opening-study at .creative-preproduction/private/studies/opening-study/v1/index.html.\n"
    );

    const promotedPath = join(root, ".creative-preproduction", "artifacts", "opening-study-v2.html");
    await mkdir(join(root, ".creative-preproduction", "artifacts"), { recursive: true });
    await writeFile(promotedPath, "<html><body>Reviewed study</body></html>", "utf8");
    await expect(runCli(
      "promote", "--root", root,
      "--artifact", "opening-study", "--version", "1",
      "--path", ".creative-preproduction/artifacts/opening-study-v2.html",
      "--rationale", "Ready for project review."
    )).resolves.toBe("Promoted opening-study v1 to v2.\n");
    await expect(access(promotedPath)).resolves.toBeUndefined();
    await expect(runCli(
      "review", "--root", root,
      "--artifact", "opening-study", "--version", "2", "--tier", "creative-lead",
      "--decision", "approved", "--reviewer", "Mina Shah", "--reviewer-id", "mina-shah",
      "--reason", "Ready to proceed with the documented hierarchy."
    )).resolves.toBe("Recorded approved review for opening-study v2.\n");

    const manifest = await new ProjectStore(root).load();
    expect(manifest.artifacts).toEqual([
      {
        id: "opening-study",
        kind: "composition-study",
        version: 1,
        path: ".creative-preproduction/private/studies/opening-study/v1/index.html",
        status: "provisional",
        visibility: "private",
        question: "Can the portrait lead?",
        rationale: "Test editorial hierarchy before approval.",
        assumptions: ["The portrait can crop to 4:5."],
        blockers: [],
        assetIds: ["campaign-portrait"],
        provider: "local-html-svg",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      },
      {
        id: "opening-study",
        kind: "composition-study",
        version: 2,
        parentVersion: 1,
        path: ".creative-preproduction/artifacts/opening-study-v2.html",
        status: "approved",
        visibility: "project",
        assetIds: ["campaign-portrait"],
        provider: "local-html-svg",
        rationale: "Ready for project review.",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    ]);
    expect(manifest.approvals).toEqual([{
      id: expect.stringMatching(/^opening-study-v2-creative-lead-approved-/),
      artifactId: "opening-study",
      artifactVersion: 2,
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reviewerId: "mina-shah",
      reason: "Ready to proceed with the documented hierarchy.",
      createdAt: expect.any(String)
    }]);
  });

  it("rolls back an unknown-rights import when manifest save fails so the same asset can be retried", async () => {
    const root = await projectRoot();
    const suppliedPath = join(root, "untracked-client-image.jpg");
    const privatePath = join(root, ".creative-preproduction", "private", "assets", "campaign-portrait", "source");
    await writeFile(suppliedPath, Buffer.from([0xff, 0xd8, 0xff]));
    await failManifestPublication(root);

    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: suppliedPath })))
      .rejects.toThrow("injected manifest save failure");
    await expect(access(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await new ProjectStore(root).load()).assets).toEqual([]);
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: suppliedPath })))
      .resolves.toBe("Added asset campaign-portrait.\n");
  });

  it("does not import an unknown-rights source when the complete asset mutation is invalid", async () => {
    const root = await projectRoot();
    const suppliedPath = join(root, "untracked-client-image.jpg");
    const privatePath = join(root, ".creative-preproduction", "private", "assets", "campaign-portrait", "source");
    await writeFile(suppliedPath, Buffer.from([0xff, 0xd8, 0xff]));

    await expect(runCli(
      ...assetAddArguments(root, { rights: "unknown", path: suppliedPath }), "--provider", "figma"
    )).rejects.toThrow(/unknown-rights.*local html\/svg/i);
    await expect(access(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the previous asset manifest when dossier publication fails for add and update", async () => {
    const root = await projectRoot();
    const dossier = join(root, ".creative-preproduction", "asset-dossier.md");
    await rm(dossier, { force: true });
    await mkdir(dossier);

    await expect(runCli(...assetAddArguments(root, { path: "public/campaign-portrait.jpg" })))
      .rejects.toThrow();
    expect((await new ProjectStore(root).load()).assets).toEqual([]);
    await rm(dossier, { recursive: true, force: true });
    await expect(runCli(...assetAddArguments(root, { path: "public/campaign-portrait.jpg" })))
      .resolves.toBe("Added asset campaign-portrait.\n");

    await rm(dossier, { force: true });
    await mkdir(dossier);
    await expect(runCli(
      "asset", "update", "--root", root, "--id", "campaign-portrait", "--provider", "manual"
    )).rejects.toThrow();
    expect((await new ProjectStore(root).load()).assets[0]?.providerScopes).toEqual(["local-html-svg"]);
    await rm(dossier, { recursive: true, force: true });
    await expect(runCli(
      "asset", "update", "--root", root, "--id", "campaign-portrait", "--provider", "manual"
    )).resolves.toBe("Updated asset campaign-portrait.\n");
  });

  it("removes a private preview when manifest save fails so exploration can be retried", async () => {
    const root = await projectRoot();
    await runCli(...assetAddArguments(root, { path: "public/campaign-portrait.jpg" }));
    const preview = join(root, ".creative-preproduction", "private", "studies", "opening-study", "v1", "index.html");
    await failManifestPublication(root);
    const arguments_ = [
      "explore-private", "--root", root,
      "--id", "opening-study", "--title", "Opening study", "--question", "Can the portrait lead?",
      "--rationale", "Test editorial hierarchy before approval.", "--asset", "campaign-portrait"
    ];

    await expect(runCli(...arguments_)).rejects.toThrow("injected manifest save failure");
    await expect(access(preview)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await new ProjectStore(root).load()).artifacts).toEqual([]);
    await expect(runCli(...arguments_)).resolves.toBe(
      "Created private study opening-study at .creative-preproduction/private/studies/opening-study/v1/index.html.\n"
    );
  });

  it("rejects ambiguous feedback sources, incomplete targets, and rights changes without managed paths", async () => {
    const root = await projectRoot();
    const feedbackPath = join(root, "feedback.txt");
    const suppliedPath = join(root, "untracked-client-image.jpg");
    await writeFile(feedbackPath, "Use a calmer rhythm.", "utf8");
    await writeFile(suppliedPath, Buffer.from([0xff, 0xd8, 0xff]));
    const feedbackArguments = [
      "feedback", "import", "--root", root, "--id", "direction", "--source", "Workshop",
      "--class", "creative-direction", "--interpretation", "Reduce visual density."
    ];

    await expect(runCli(...feedbackArguments, "--message", "Use a calmer rhythm.", "--file", feedbackPath))
      .rejects.toThrow("Provide exactly one of --message or --file.");
    await expect(runCli(...feedbackArguments)).rejects.toThrow("Provide exactly one of --message or --file.");
    await expect(runCli(...feedbackArguments, "--message", "Use a calmer rhythm.", "--target-kind", "project"))
      .rejects.toThrow("Feedback targets require --target-kind and --target-id together.");
    await expect(runCli(...feedbackArguments, "--message", "Use a calmer rhythm.", "--target-id", "civic-arts"))
      .rejects.toThrow("Feedback targets require --target-kind and --target-id together.");
    await runCli(...assetAddArguments(root, { rights: "unknown", path: suppliedPath }));
    await expect(runCli(
      "asset", "update", "--root", root, "--id", "campaign-portrait", "--rights", "cleared"
    )).rejects.toThrow("Changing an unknown-rights asset requires a managed --path.");
  });

  it("preserves the import save error when cleanup fails and reuses identical orphan bytes", async () => {
    const root = await projectRoot();
    const source = join(root, "original.jpg");
    const workspace = new PrivateWorkspace(root);
    await writeFile(source, "first bytes");
    const target = workspace.resolveRef("campaign-portrait");
    await mkdir(join(target, ".."), { recursive: true });
    const neighbor = join(target, "..", "notes.txt");
    await writeFile(neighbor, "keep notes");
    await failManifestPublication(root);
    vi.spyOn(PrivateWorkspace.prototype, "removeImportedFile").mockRejectedValueOnce(new Error("cleanup failed"));
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source })))
      .rejects.toThrow("injected manifest save failure");
    expect((await new ProjectStore(root).load()).assets).toEqual([]);
    expect(await readFile(target, "utf8")).toBe("first bytes");
    await writeFile(source, "different bytes");
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source }))).rejects.toThrow(/already exists/i);
    expect(await readFile(target, "utf8")).toBe("first bytes");
    await writeFile(source, "first bytes");
    await failManifestPublication(root);
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source })))
      .rejects.toThrow("injected manifest save failure");
    expect(await readFile(target, "utf8")).toBe("first bytes");
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source }))).resolves.toContain("Added asset");
    expect(await readFile(neighbor, "utf8")).toBe("keep notes");
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source }))).rejects.toThrow(/already exists/i);
    expect(await readFile(target, "utf8")).toBe("first bytes");
  });

  it("reports committed unknown-rights imports as success even when journal cleanup fails", async () => {
    const root = await projectRoot();
    const source = join(root, "original.jpg");
    await writeFile(source, "private bytes");
    const journal = join(root, ".creative-preproduction", "private", "asset-mutation.json");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path) === journal) throw new Error("cleanup failed");
      return actual.rm(path, options);
    });
    await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: source }))).resolves.toContain("Added asset");
    expect(await readFile(new PrivateWorkspace(root).resolveRef("campaign-portrait"), "utf8")).toBe("private bytes");
    vi.mocked(rm).mockRestore();
    expect((await new ProjectStore(root).load()).assets[0]?.storage).toEqual({ kind: "private", ref: "campaign-portrait" });
    await expect(readFile(journal)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([false, true])("preserves preview neighbors and retries after cleanup failure=%s", async (cleanupFails) => {
    const root = await projectRoot();
    await runCli(...assetAddArguments(root, { path: "public/portrait.jpg" }));
    const directory = new PrivateWorkspace(root).studyDirectory("opening-study", 1);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "notes.txt"), "keep notes");
    await mkdir(join(directory, "references"));
    await writeFile(join(directory, "references", "reference.txt"), "keep reference");
    const args = ["explore-private", "--root", root, "--id", "opening-study", "--title", "Opening study",
      "--question", "Can the portrait lead?", "--rationale", "Explore", "--asset", "campaign-portrait"];
    await failManifestPublication(root);
    if (cleanupFails) vi.spyOn(PrivateWorkspace.prototype, "removeStudy").mockRejectedValueOnce(new Error("cleanup failed"));
    await expect(runCli(...args)).rejects.toThrow("injected manifest save failure");
    expect(await readFile(join(directory, "notes.txt"), "utf8")).toBe("keep notes");
    expect(await readFile(join(directory, "references", "reference.txt"), "utf8")).toBe("keep reference");
    if (cleanupFails) {
      await expect(runCli(...args, "--note", "Different content")).rejects.toThrow(/already exists/i);
      await failManifestPublication(root);
      await expect(runCli(...args)).rejects.toThrow("injected manifest save failure");
      expect(await readFile(join(directory, "index.html"), "utf8")).toContain("Opening study");
    }
    await expect(runCli(...args)).resolves.toContain("Created private study");
    await expect(runCli(...args)).rejects.toThrow(/already exists/i);
    expect((await new ProjectStore(root).load()).artifacts).toHaveLength(1);
    expect(await readFile(join(directory, "index.html"), "utf8")).toContain("Opening study");
  });

  it.each(["/outside.jpg", "C:\\outside.jpg", "../outside.jpg", "..\\outside.jpg", "public/../outside.jpg"])(
    "rejects unsafe managed path %s in add, update, and promote", async (path) => {
      const root = await projectRoot();
      for (const rights of ["cleared", "restricted"] as const) {
        await expect(runCli(...assetAddArguments(root, { rights, path }))).rejects.toThrow(/project|relative/i);
      }
      await runCli(...assetAddArguments(root, { path: "public/portrait.jpg" }));
      await expect(runCli("asset", "update", "--root", root, "--id", "campaign-portrait", "--path", path))
        .rejects.toThrow(/project|relative/i);
      await runCli("explore-private", "--root", root, "--id", "study", "--title", "Study", "--question", "Lead?",
        "--rationale", "Explore", "--asset", "campaign-portrait");
      await expect(runCli("promote", "--root", root, "--artifact", "study", "--version", "1", "--path", path,
        "--rationale", "Review")).rejects.toThrow(/project|relative/i);
      expect((await new ProjectStore(root).load()).assets[0]?.storage).toEqual({ kind: "managed", path: "public/portrait.jpg" });
      expect((await new ProjectStore(root).load()).artifacts).toHaveLength(1);
    }
  );

  it("serializes competing asset commands before private import and preserves both successful updates", async () => {
    const root = await projectRoot();
    const firstSource = join(root, "first.jpg");
    const secondSource = join(root, "second.jpg");
    await writeFile(firstSource, "first bytes");
    await writeFile(secondSource, "second bytes");
    const reached = deferred();
    const release = deferred();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if (String(to) === join(root, ".creative-preproduction", "asset-dossier.md")) {
        reached.resolve(); await release.promise;
      }
    });
    const first = runCli(...assetAddArguments(root, { rights: "unknown", path: firstSource }));
    try {
      await reached.promise;
      await expect(runCli(...assetAddArguments(root, { rights: "unknown", path: secondSource })))
        .rejects.toThrow(/another writer/i);
      await expect(runCli("participant", "add", "--root", root, "--id", "mina", "--name", "Mina", "--role", "creative-lead"))
        .rejects.toThrow(/another writer/i);
    } finally { release.resolve(); await first; }
    expect(await readFile(new PrivateWorkspace(root).resolveRef("campaign-portrait"), "utf8")).toBe("first bytes");
    await runCli(...assetAddArguments(root, { id: "second", rights: "unknown", path: secondSource }));
    await runCli("participant", "add", "--root", root, "--id", "mina", "--name", "Mina", "--role", "creative-lead");
    const manifest = await new ProjectStore(root).load();
    expect(manifest.assets.map(({ id }) => id)).toEqual(["campaign-portrait", "second"]);
    expect(manifest.participants.map(({ id }) => id)).toEqual(["mina"]);
    const dossier = await readFile(join(root, ".creative-preproduction", "asset-dossier.md"), "utf8");
    expect(dossier).toContain("## campaign-portrait:");
    expect(dossier).toContain("## second:");
  });

  it("does not let a competing preview command remove the committed preview", async () => {
    const root = await projectRoot();
    await runCli(...assetAddArguments(root, { path: "public/portrait.jpg" }));
    const args = ["explore-private", "--root", root, "--id", "study", "--title", "First study",
      "--question", "Lead?", "--rationale", "Explore", "--asset", "campaign-portrait"];
    const reached = deferred();
    const release = deferred();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if (String(to) === join(root, ".creative-preproduction", "manifest.json")) {
        reached.resolve(); await release.promise;
      }
    });
    const first = runCli(...args);
    try {
      await reached.promise;
      await expect(runCli(...args, "--title", "Second study")).rejects.toThrow(/another writer/i);
    } finally { release.resolve(); await first; }
    await expect(runCli(...args)).rejects.toThrow(/already exists/i);
    const manifest = await new ProjectStore(root).load();
    expect(manifest.artifacts).toHaveLength(1);
    expect(await readFile(join(root, manifest.artifacts[0]!.path), "utf8")).toContain("First study");
  });

  it("guides v1 projects to migrate instead of loading them as v2", async () => {
    const root = await projectRoot();
    await writeFile(join(root, ".creative-preproduction", "manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      harnessVersion: "0.1.0",
      project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
      stage: "brief",
      artifacts: [],
      approvals: [],
      references: [],
      unresolvedQuestions: [],
      createdAt: "2026-09-17T18:00:00.000Z",
      updatedAt: "2026-09-17T18:00:00.000Z"
    }, null, 2)}\n`, "utf8");

    await expect(runCli("status", "--root", root)).resolves.toBe(
      "Project: Civic Arts\nKind: new-site\nCurrent stage: brief\nMigration required: run creative-preproduction migrate --root <project-root>.\n"
    );
  });
});
