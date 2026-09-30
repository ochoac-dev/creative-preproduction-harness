import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeProject } from "../../src/services/initializer.js";
import { addAsset, createAsset } from "../../src/services/assets.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { writeAssetDossier } from "../../src/services/asset-dossier.js";
import type { ProjectManifest } from "../../src/domain/schema.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "asset-transaction-"));
  await initializeProject({ root, id: "museum", name: "Museum", kind: "new-site" });
  const workspace = join(root, ".creative-preproduction");
  return { root, workspace, store: new ProjectStore(root), journal: join(workspace, "private", "asset-mutation.json") };
}
function add(manifest: ProjectManifest, id = "portrait") {
  return addAsset(manifest, createAsset({
    id, title: id, source: "Client", intendedRole: "Lead", modificationPolicy: "adaptable",
    rightsStatus: "cleared", providerScopes: [], storage: { kind: "managed", path: `public/${id}.jpg` },
    allowedTreatments: [], prohibitedTreatments: [], visualNotes: {}, responsiveGuidance: "Keep visible",
    accessibilityIntent: "Portrait", unresolvedQuestions: []
  }));
}
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}

describe("durable asset mutation", () => {
  it("rejects a stale save when the first observation was a v2 no-op migration", async () => {
    const { store, root } = await fixture();
    const stale = await store.migrate("0.2.0");
    await new ProjectStore(root).mutateAssets((manifest) => add(manifest));
    await expect(store.save({ ...stale, stage: "research" })).rejects.toThrow(/changed.*reload/i);
    expect((await new ProjectStore(root).load()).assets.map(({ id }) => id)).toEqual(["portrait"]);
  });

  it("refreshes an old observation when returning fresh state from v2 migration", async () => {
    const { store, root } = await fixture();
    await store.load();
    await new ProjectStore(root).mutateAssets((manifest) => add(manifest));
    const fresh = await store.migrate("0.2.0");
    await expect(store.save({ ...fresh, stage: "research" })).resolves.toBeUndefined();
    expect((await store.load()).stage).toBe("research");
    expect((await store.load()).assets.map(({ id }) => id)).toEqual(["portrait"]);
  });

  it("preserves approved-artifact immutability even when a transaction callback mutates its input", async () => {
    const { store } = await fixture();
    const manifest = await store.load();
    await store.save({ ...manifest, artifacts: [{
      id: "brief", version: 1, kind: "creative-brief", path: "brief.md", status: "approved", visibility: "project",
      assetIds: [], rationale: "Approved direction", createdAt: manifest.createdAt, updatedAt: manifest.updatedAt
    }] });
    await expect(store.mutateAssets((current) => {
      current.artifacts.splice(0);
      return add(current);
    })).rejects.toThrow(/approved.*immutable/i);
    const persisted = await store.load();
    expect(persisted.assets).toEqual([]);
    expect(persisted.artifacts[0]?.status).toBe("approved");
  });

  it("coordinates standalone dossier writers and rejects stale projections", async () => {
    const { store, root, workspace } = await fixture();
    const stale = await store.load();
    const reached = deferred();
    const release = deferred();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to) === join(workspace, "manifest.json")) { reached.resolve(); await release.promise; }
      await actual.rename(from, to);
    });
    const writing = store.mutateAssets((manifest) => add(manifest));
    try {
      await reached.promise;
      await expect(writeAssetDossier(root, stale)).rejects.toThrow(/another writer/i);
    } finally { release.resolve(); await writing; }
    await expect(writeAssetDossier(root, stale)).rejects.toThrow(/changed.*reload/i);
    expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toContain("## portrait: portrait");
  });

  it("refreshes the dossier even for an unchanged asset mutation", async () => {
    const { store, workspace } = await fixture();
    await store.mutateAssets((manifest) => add(manifest));
    await writeFile(join(workspace, "asset-dossier.md"), "stale dossier");
    await store.mutateAssets((manifest) => manifest);
    expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toContain("## portrait: portrait");
  });

  it("recognizes a committed manifest even if publication reports failure and journal cleanup also fails", async () => {
    const { store, workspace, journal } = await fixture();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if (String(to) === join(workspace, "manifest.json")) throw new Error("after publication");
    });
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path) === journal) throw new Error("cleanup failed");
      return actual.rm(path, options);
    });
    await expect(store.mutateAssets((manifest) => add(manifest))).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8")).assets[0].id).toBe("portrait");
    expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toContain("## portrait: portrait");
  });

  it.each(["manifest stage", "dossier stage", "journal stage", "journal publish", "dossier publish", "manifest publish"])(
    "preserves both previous files after failure at %s and permits retry", async (stage) => {
      const { store, workspace, journal } = await fixture();
      const beforeManifest = await readFile(join(workspace, "manifest.json"), "utf8");
      const beforeDossier = await readFile(join(workspace, "asset-dossier.md"), "utf8");
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      const failure = new Error(`injected ${stage}`);
      let injected = false;
      vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
        const name = String(path);
        const match = stage === "manifest stage" ? name.includes("manifest.json.") :
          stage === "dossier stage" ? name.includes("asset-dossier.md.") :
          stage === "journal stage" ? name.includes("asset-mutation.json.") : false;
        if (match && !injected) { injected = true; throw failure; }
        return actual.writeFile(path, data, options);
      });
      vi.mocked(rename).mockImplementation(async (from, to) => {
        const match = stage === "journal publish" ? String(to) === journal :
          stage === "dossier publish" ? String(to) === join(workspace, "asset-dossier.md") :
          stage === "manifest publish" ? String(to) === join(workspace, "manifest.json") : false;
        if (match && !injected) { injected = true; throw failure; }
        return actual.rename(from, to);
      });
      await expect(store.mutateAssets((manifest) => add(manifest))).rejects.toBe(failure);
      expect(await readFile(join(workspace, "manifest.json"), "utf8")).toBe(beforeManifest);
      expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toBe(beforeDossier);
      await expect(store.mutateAssets((manifest) => add(manifest))).resolves.toBeUndefined();
      expect((await store.load()).assets.map((asset) => asset.id)).toEqual(["portrait"]);
      expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toContain("## portrait: portrait");
    }
  );

  it.each(["load", "save", "migrate", "transaction"] as const)("repairs a committed journal before %s", async (entry) => {
    const { store, workspace, journal, root } = await fixture();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path) === journal) throw new Error("journal cleanup failed");
      return actual.rm(path, options);
    });
    await expect(store.mutateAssets((manifest) => add(manifest))).resolves.toBeUndefined();
    const committed = JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8")) as ProjectManifest;
    expect(committed.assets.map((asset) => asset.id)).toEqual(["portrait"]);
    await expect(readFile(journal, "utf8")).resolves.toContain("portrait");
    vi.mocked(rm).mockRestore();
    // A pending committed journal must also repair a missing projection, not merely remove itself.
    await actual.rm(join(workspace, "asset-dossier.md"));
    const fresh = new ProjectStore(root);
    if (entry === "load") await fresh.load();
    if (entry === "save") await fresh.save({ ...committed, stage: "research" });
    if (entry === "migrate") await fresh.migrate("0.2.0");
    if (entry === "transaction") await fresh.mutateAssets((manifest) => add(manifest, "landscape"));
    expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toContain("## portrait: portrait");
    await expect(readFile(journal)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the original publication error and pending recovery when rollback also fails", async () => {
    const { store, root, workspace, journal } = await fixture();
    const before = await readFile(join(workspace, "asset-dossier.md"), "utf8");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const failure = new Error("manifest publication failed");
    let publishedDossier = false;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to) === join(workspace, "manifest.json")) throw failure;
      if (String(to) === join(workspace, "asset-dossier.md")) {
        if (publishedDossier) throw new Error("rollback failed");
        publishedDossier = true;
      }
      return actual.rename(from, to);
    });
    await expect(store.mutateAssets((manifest) => add(manifest))).rejects.toBe(failure);
    await expect(readFile(journal)).resolves.toBeDefined();
    vi.mocked(rename).mockRestore();
    expect((await new ProjectStore(root).load()).assets).toEqual([]);
    expect(await readFile(join(workspace, "asset-dossier.md"), "utf8")).toBe(before);
    await expect(store.mutateAssets((manifest) => add(manifest))).resolves.toBeUndefined();
  });

  it("holds the manifest lock through publication and rejects a stale writer without losing either update", async () => {
    const { store, root, workspace } = await fixture();
    const staleStore = new ProjectStore(root);
    const stale = await staleStore.load();
    const reached = deferred();
    const release = deferred();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if (String(to) === join(workspace, "asset-dossier.md")) { reached.resolve(); await release.promise; }
    });
    const writing = store.mutateAssets((manifest) => add(manifest));
    try {
      await reached.promise;
      await expect(new ProjectStore(root).load()).rejects.toThrow(/another writer/i);
      await expect(new ProjectStore(root).mutateAssets((manifest) => add(manifest, "landscape"))).rejects.toThrow(/another writer/i);
      await expect(staleStore.save({ ...stale, stage: "research" })).rejects.toThrow(/another writer/i);
    } finally { release.resolve(); await writing; }
    await expect(staleStore.save({ ...stale, stage: "research" })).rejects.toThrow(/changed.*reload/i);
    await new ProjectStore(root).mutateAssets((manifest) => add(manifest, "landscape"));
    expect((await store.load()).assets.map((asset) => asset.id)).toEqual(["portrait", "landscape"]);
    const dossier = await readFile(join(workspace, "asset-dossier.md"), "utf8");
    expect(dossier).toContain("## portrait: portrait");
    expect(dossier).toContain("## landscape: landscape");
    expect((await readdir(workspace)).filter((name) => /\.(tmp|lock)$/.test(name))).toEqual([]);
  });
});
