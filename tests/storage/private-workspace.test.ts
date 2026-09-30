import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PrivateWorkspace } from "../../src/storage/private-workspace.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { addAsset, createAsset } from "../../src/services/assets.js";

describe("PrivateWorkspace", () => {
  it.each(["private asset", "managed asset", "artifact"])("preserves a private source referenced by a canonical %s", async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-reference-"));
    await initializeProject({ root, id: "museum", name: "Museum", kind: "new-site" });
    const workspace = new PrivateWorkspace(root);
    const source = join(root, "original.jpg");
    await writeFile(source, "keep source");
    const publication = await workspace.importFile("portrait", source);
    const store = new ProjectStore(root);
    const manifest = await store.load();
    if (kind === "artifact") {
      await store.save({ ...manifest, artifacts: [{
        id: "reference", kind: "composition-study", version: 1, path: publication.relativePath,
        status: "approved", visibility: "private", assetIds: [], rationale: "Existing work",
        createdAt: manifest.createdAt, updatedAt: manifest.updatedAt
      }] });
    } else {
      const withAsset = addAsset(manifest, createAsset({
        id: "existing", title: "Existing asset", source: "Client", intendedRole: "Lead", modificationPolicy: "adaptable",
        rightsStatus: kind === "private asset" ? "unknown" : "cleared",
        providerScopes: ["local-html-svg"], storage: kind === "private asset"
          ? { kind: "private", ref: "portrait" } : { kind: "managed", path: "public/portrait.jpg" },
        allowedTreatments: [], prohibitedTreatments: [], visualNotes: {}, responsiveGuidance: "Keep visible",
        accessibilityIntent: "Portrait", unresolvedQuestions: []
      }));
      // Legacy mislabeled records still protect their source during cleanup.
      await store.save(kind === "private asset" ? withAsset : {
        ...withAsset, assets: withAsset.assets.map((asset) => ({
          ...asset, storage: { kind: "managed", path: publication.relativePath }
        }))
      });
    }
    const failure = new Error("failed operation");
    await expect(store.mutate(() => { throw failure; }, () => workspace.removeImportedFile("portrait"))).rejects.toBe(failure);
    expect(await readFile(workspace.resolveRef("portrait"), "utf8")).toBe("keep source");
  });

  it("initializes an ignored private directory without private content", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const workspace = new PrivateWorkspace(root);

    await workspace.initialize();

    const privateRoot = join(root, ".creative-preproduction", "private");
    expect(await readFile(join(privateRoot, ".gitignore"), "utf8")).toBe("*\n!.gitignore\n");
    expect(await readdir(privateRoot)).toEqual([".gitignore"]);
  });

  it("imports a source under a normalized opaque ID and resolves that reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const sourcePath = join(root, "Client Portrait FINAL.jpg");
    const sourceBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    await writeFile(sourcePath, sourceBytes);
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();

    const stored = await workspace.importFile("Campaign Portrait 01", sourcePath);

    expect(stored).toEqual({
      ref: "campaign-portrait-01",
      ownership: "created",
      relativePath: ".creative-preproduction/private/assets/campaign-portrait-01/source"
    });
    expect(await readFile(join(root, stored.relativePath))).toEqual(sourceBytes);
    expect(workspace.resolveRef(stored.ref)).toBe(join(root, stored.relativePath));
    expect(stored.relativePath).not.toContain("Client Portrait FINAL.jpg");
    expect(await workspace.importFile("campaign-portrait-01", sourcePath)).toMatchObject({ ownership: "reused" });
  });

  it("rejects traversal and absolute identifiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const workspace = new PrivateWorkspace(root);

    expect(() => workspace.resolveRef("../outside")).toThrow(/safe private reference/i);
    expect(() => workspace.resolveRef("C:\\outside")).toThrow(/safe private reference/i);
    expect(() => workspace.studyDirectory("../../outside", 1)).toThrow(/safe artifact id/i);
    expect(() => workspace.studyDirectory("study", 0)).toThrow(/positive version/i);
  });

  it("rejects an opaque destination collision without replacing the first source", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const first = join(root, "first.png");
    const second = join(root, "second.png");
    await writeFile(first, "first", "utf8");
    await writeFile(second, "second", "utf8");
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();
    await workspace.importFile("portrait", first);

    await expect(workspace.importFile("portrait", second)).rejects.toThrow(/already exists/i);
    expect(await readFile(workspace.resolveRef("portrait"), "utf8")).toBe("first");
    expect(await readdir(join(root, ".creative-preproduction", "private", "assets", "portrait")))
      .toEqual(["source"]);
  });

  it("cleans an interrupted import so a retry can publish the complete source", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const missing = join(root, "missing.png");
    const source = join(root, "source.png");
    await writeFile(source, "complete", "utf8");
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();

    await expect(workspace.importFile("portrait", missing)).rejects.toMatchObject({ code: "ENOENT" });
    await workspace.importFile("portrait", source);

    expect(await readFile(workspace.resolveRef("portrait"), "utf8")).toBe("complete");
    expect(await readdir(join(root, ".creative-preproduction", "private", "assets", "portrait")))
      .toEqual(["source"]);
  });

  it("allows exactly one concurrent import and preserves the winning bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const first = join(root, "first.png");
    const second = join(root, "second.png");
    await writeFile(first, "first-complete", "utf8");
    await writeFile(second, "second-complete", "utf8");
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();

    const results = await Promise.allSettled([
      workspace.importFile("portrait", first),
      workspace.importFile("portrait", second)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(["first-complete", "second-complete"])
      .toContain(await readFile(workspace.resolveRef("portrait"), "utf8"));
    expect(await readdir(join(root, ".creative-preproduction", "private", "assets", "portrait")))
      .toEqual(["source"]);
  });

  it("rejects a linked asset ancestor instead of copying outside the private workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-private-"));
    const outside = await mkdtemp(join(tmpdir(), "creative-private-outside-"));
    const source = join(root, "source.png");
    await writeFile(source, "private", "utf8");
    const workspace = new PrivateWorkspace(root);
    await workspace.initialize();
    try {
      await symlink(
        outside,
        join(root, ".creative-preproduction", "private", "assets"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error: unknown) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        return;
      }
      throw error;
    }

    await expect(workspace.importFile("portrait", source)).rejects.toThrow(/linked ancestor/i);
    await expect(readFile(join(outside, "portrait", "source"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
