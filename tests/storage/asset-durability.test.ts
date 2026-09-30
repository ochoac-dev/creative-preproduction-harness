import { mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStore } from "../../src/storage/project-store.js";
import { initializeProject } from "../../src/services/initializer.js";
import { addAsset, createAsset } from "../../src/services/assets.js";
import type { ProjectManifest } from "../../src/domain/schema.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "asset-durability-"));
  await initializeProject({ root, id: "museum", name: "Museum", kind: "new-site" });
  const workspace = join(root, ".creative-preproduction");
  const privateRoot = join(workspace, "private");
  return { root, workspace, privateRoot, manifest: join(workspace, "manifest.json"),
    dossier: join(workspace, "asset-dossier.md"), journal: join(privateRoot, "asset-mutation.json") };
}

function add(manifest: ProjectManifest) {
  return addAsset(manifest, createAsset({
    id: "portrait", title: "Portrait", source: "Client", intendedRole: "Lead", modificationPolicy: "adaptable",
    rightsStatus: "cleared", providerScopes: [], storage: { kind: "managed", path: "public/portrait.jpg" },
    allowedTreatments: [], prohibitedTreatments: [], visualNotes: {}, responsiveGuidance: "Keep visible",
    accessibilityIntent: "Portrait", unresolvedQuestions: []
  }));
}

describe("asset transaction directory durability", () => {
  it("orders journal, dossier, manifest, and journal removal barriers", async () => {
    const paths = await fixture();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const events: string[] = [];
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      const file = await actual.open(path, flags, mode);
      if ([paths.workspace, paths.privateRoot].includes(String(path))) {
        vi.spyOn(file, "sync").mockImplementation(async () => { events.push(`sync:${String(path)}`); });
      }
      return file;
    });
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if ([paths.journal, paths.dossier, paths.manifest].includes(String(to))) events.push(`rename:${String(to)}`);
    });
    vi.mocked(rm).mockImplementation(async (path, options) => {
      await actual.rm(path, options);
      if (String(path) === paths.journal) events.push("remove journal");
    });
    await new ProjectStore(paths.root).mutateAssets(add);
    const journalRename = events.indexOf(`rename:${paths.journal}`);
    const dossierRename = events.indexOf(`rename:${paths.dossier}`);
    const manifestRename = events.indexOf(`rename:${paths.manifest}`);
    const journalRemoval = events.indexOf("remove journal");
    expect(events.slice(journalRename + 1, dossierRename)).toContain(`sync:${paths.privateRoot}`);
    expect(events.slice(dossierRename + 1, manifestRename)).toContain(`sync:${paths.workspace}`);
    expect(events.slice(manifestRename + 1, journalRemoval)).toContain(`sync:${paths.workspace}`);
    expect(events.slice(journalRemoval + 1)).toContain(`sync:${paths.privateRoot}`);
  });

  it.each([
    ["journal rename", false], ["journal sync", false], ["dossier rename", false], ["dossier sync", false],
    ["manifest rename", false], ["manifest sync", true], ["journal removal", true], ["journal removal sync", true]
  ] as const)("recovers the last directory-synced state after a crash at %s", async (crashStage, committed) => {
    const paths = await fixture();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const optionalRead = async (path: string) => {
      try { return await actual.readFile(path, "utf8"); }
      catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    };
    let durable = { manifest: await optionalRead(paths.manifest), dossier: await optionalRead(paths.dossier), journal: null as string | null };
    let crash: typeof durable | undefined;
    let phase = "";
    const record = (stage: string) => {
      phase = stage;
      if (stage === crashStage && crash === undefined) {
        crash = { ...durable };
        throw new Error(`simulated crash at ${stage}`);
      }
    };
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      const file = await actual.open(path, flags, mode);
      if ([paths.workspace, paths.privateRoot].includes(String(path))) {
        vi.spyOn(file, "sync").mockImplementation(async () => {
          if (String(path) === paths.workspace) {
            durable = { ...durable, manifest: await optionalRead(paths.manifest), dossier: await optionalRead(paths.dossier) };
          } else durable.journal = await optionalRead(paths.journal);
          const stage = phase === "journal removal" ? "journal removal sync" : phase.replace("rename", "sync");
          record(stage);
        });
      }
      return file;
    });
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actual.rename(from, to);
      if (String(to) === paths.journal) record("journal rename");
      if (String(to) === paths.dossier) record("dossier rename");
      if (String(to) === paths.manifest) record("manifest rename");
    });
    vi.mocked(rm).mockImplementation(async (path, options) => {
      await actual.rm(path, options);
      if (String(path) === paths.journal) record("journal removal");
    });
    await Promise.allSettled([new ProjectStore(paths.root).mutateAssets(add)]);
    expect(crash, `required durability stage ${crashStage} was never reached`).toBeDefined();
    vi.restoreAllMocks();
    // Model loss of unsynced directory entries. The accepted stale lock has been
    // released/cleared; only the last successfully synced namespace survives.
    for (const key of ["manifest", "dossier", "journal"] as const) {
      if (crash![key] === null) await actual.rm(paths[key], { force: true });
      else await actual.writeFile(paths[key], crash![key]!, "utf8");
    }
    const recovered = await new ProjectStore(paths.root).load();
    expect(recovered.assets.map(({ id }) => id)).toEqual(committed ? ["portrait"] : []);
    const dossier = await readFile(paths.dossier, "utf8");
    if (committed) expect(dossier).toContain("## portrait: Portrait");
    else expect(dossier).not.toContain("## portrait: Portrait");
    await expect(readFile(paths.journal)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
