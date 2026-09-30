import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactRecord, LegacyProjectManifest, ProjectManifest } from "../../src/domain/schema.js";
import { recordApproval, reviseArtifact } from "../../src/services/artifacts.js";
import { initializeProject } from "../../src/services/initializer.js";
import { findHarnessPackage } from "../../src/services/package-info.js";
import { ManifestMigrationRequiredError, ProjectStore } from "../../src/storage/project-store.js";

const legacyManifest = {
  schemaVersion: 1,
  harnessVersion: "0.1.0",
  project: { id: "museum", name: "Museum", kind: "new-site" },
  stage: "brief",
  artifacts: [{
    id: "creative-brief",
    kind: "creative-brief",
    version: 1,
    path: ".creative-preproduction/creative-brief-v1.md",
    status: "approved",
    rationale: "Defines the shared intent before research begins.",
    createdAt: "2026-09-16T18:00:00.000Z",
    updatedAt: "2026-09-16T18:00:00.000Z"
  }],
  approvals: [{
    id: "creative-brief-v1-creative-lead-approved",
    artifactId: "creative-brief",
    artifactVersion: 1,
    tier: "creative-lead",
    decision: "approved",
    reviewer: "Mina Shah",
    reason: "The brief is ready to guide research.",
    createdAt: "2026-09-16T18:00:00.000Z"
  }],
  references: [],
  unresolvedQuestions: [],
  createdAt: "2026-09-16T18:00:00.000Z",
  updatedAt: "2026-09-16T18:00:00.000Z"
} satisfies LegacyProjectManifest;

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm)
  };
});

const manifest = {
  schemaVersion: 2,
  harnessVersion: "0.2.0",
  project: { id: "museum", name: "Museum", kind: "new-site" },
  stage: "brief",
  participants: [],
  decisionOwners: [],
  artifacts: [],
  approvals: [],
  assets: [],
  feedback: [],
  references: [],
  unresolvedQuestions: [],
  createdAt: "2026-09-16T18:00:00.000Z",
  updatedAt: "2026-09-16T18:00:00.000Z"
} satisfies ProjectManifest;

const approvedArtifact: ArtifactRecord = {
  id: "brief",
  kind: "creative-brief",
  version: 1,
  path: "brief-v1.md",
  status: "approved",
  visibility: "project",
  assetIds: [],
  rationale: "The audience and intended outcome are confirmed.",
  createdAt: manifest.createdAt,
  updatedAt: manifest.updatedAt
};

afterEach(() => {
  vi.mocked(writeFile).mockRestore();
  vi.mocked(rename).mockRestore();
  vi.mocked(rm).mockRestore();
});

describe("ProjectStore manifest migration", () => {
  it("requires explicit migration to load a v1 manifest while inspection remains available", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-migration-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "manifest.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
    const store = new ProjectStore(root);

    await expect(store.load()).rejects.toThrow(ManifestMigrationRequiredError);
    await expect(store.load()).rejects.toThrow(/migration required/i);
    await expect(store.inspect()).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it("backs up v1 bytes and atomically replaces them with a valid v2 manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-migration-"));
    const workspace = join(root, ".creative-preproduction");
    const manifestPath = join(workspace, "manifest.json");
    const backupPath = `${manifestPath}.v1.backup`;
    const v1Bytes = `${JSON.stringify(legacyManifest, null, 2)}\n`;
    await mkdir(workspace, { recursive: true });
    await writeFile(manifestPath, v1Bytes, "utf8");

    const migrated = await new ProjectStore(root).migrate("0.2.0", new Date("2026-09-17T18:00:00Z"));

    expect(await readFile(backupPath, "utf8")).toBe(v1Bytes);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.artifacts).toEqual([{
      ...legacyManifest.artifacts[0],
      visibility: "project",
      assetIds: []
    }]);
    expect(migrated.approvals).toEqual(legacyManifest.approvals);
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(migrated);
  });

  it("refuses to overwrite an existing v1 backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-migration-"));
    const workspace = join(root, ".creative-preproduction");
    const manifestPath = join(workspace, "manifest.json");
    await mkdir(workspace, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
    await writeFile(`${manifestPath}.v1.backup`, "original v1 bytes", "utf8");

    await expect(new ProjectStore(root).migrate("0.2.0")).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(`${manifestPath}.v1.backup`, "utf8")).toBe("original v1 bytes");
  });

  it("returns an existing v2 manifest without rewriting it or creating a backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-migration-"));
    const workspace = join(root, ".creative-preproduction");
    const manifestPath = join(workspace, "manifest.json");
    const v2Bytes = `${JSON.stringify(manifest, null, 2)}\n`;
    await mkdir(workspace, { recursive: true });
    await writeFile(manifestPath, v2Bytes, "utf8");

    await expect(new ProjectStore(root).migrate("0.2.0")).resolves.toEqual(manifest);
    expect(await readFile(manifestPath, "utf8")).toBe(v2Bytes);
    await expect(readFile(`${manifestPath}.v1.backup`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("ProjectStore approved-record immutability", () => {
  it("rejects removal of an approved record and preserves the canonical bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
    const store = new ProjectStore(root);
    await store.save({ ...manifest, artifacts: [approvedArtifact] });
    const path = join(root, ".creative-preproduction", "manifest.json");
    const before = await readFile(path, "utf8");

    await expect(store.save(manifest)).rejects.toThrow(/approved.*immutable/i);

    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(join(root, ".creative-preproduction"))).toEqual(["manifest.json"]);
  });

  it.each([
    ["ID", { id: "other-brief" }],
    ["kind", { kind: "identity-thesis" }],
    ["version", { version: 2 }],
    ["path", { path: "replaced.md" }],
    ["status", { status: "draft" }],
    ["rationale", { rationale: "Silently replaced the approved rationale." }],
    ["parent version", { parentVersion: 1 }],
    ["creation timestamp", { createdAt: "2026-09-17T18:00:00Z" }],
    ["update timestamp", { updatedAt: "2026-09-17T18:00:00Z" }]
  ] satisfies Array<[string, Partial<ArtifactRecord>]>) (
    "rejects an approved record's changed %s and preserves the canonical bytes",
    async (_field, change) => {
      const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
      const store = new ProjectStore(root);
      await store.save({ ...manifest, artifacts: [approvedArtifact] });
      const path = join(root, ".creative-preproduction", "manifest.json");
      const before = await readFile(path, "utf8");

      await expect(store.save({ ...manifest, artifacts: [{ ...approvedArtifact, ...change }] }))
        .rejects.toThrow(/approved.*immutable/i);

      expect(await readFile(path, "utf8")).toBe(before);
      expect(await readdir(join(root, ".creative-preproduction"))).toEqual(["manifest.json"]);
    }
  );

  it("allows appending a revision and new approval decisions while retaining the approved record", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
    const store = new ProjectStore(root);
    await store.save({ ...manifest, artifacts: [approvedArtifact] });
    const revision = reviseArtifact(approvedArtifact, {
      path: "brief-v2.md", rationale: "Clarifies the intended audience."
    });
    const { approval } = recordApproval({
      artifact: approvedArtifact, tier: "creative-lead", decision: "returned",
      reviewer: "Mina Shah", reason: "Clarify the intended audience."
    });
    const updated = { ...manifest, artifacts: [approvedArtifact, revision], approvals: [approval] };

    await store.save(updated);

    expect(await store.load()).toEqual(updated);
  });
});

describe("ProjectStore failure cleanup", () => {
  it("removes a partial temporary manifest and rethrows when writing fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    const writeFailure = new Error("write failed");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(writeFile).mockImplementationOnce(async (path) => {
      await actual.writeFile(path, "{ partial", "utf8");
      throw writeFailure;
    });

    await expect(new ProjectStore(root).save(manifest)).rejects.toBe(writeFailure);

    expect(await readdir(workspace)).toEqual([]);
  });

  it("preserves the existing manifest and removes owned files when rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
    const store = new ProjectStore(root);
    await store.save(manifest);
    const workspace = join(root, ".creative-preproduction");
    const before = await readFile(join(workspace, "manifest.json"), "utf8");
    const renameFailure = new Error("rename failed");
    vi.mocked(rename).mockRejectedValueOnce(renameFailure);

    await expect(store.save({ ...manifest, stage: "research" })).rejects.toBe(renameFailure);

    expect(await readFile(join(workspace, "manifest.json"), "utf8")).toBe(before);
    expect(await readdir(workspace)).toEqual(["manifest.json"]);
  });

  it("does not mask the write failure when temporary-file cleanup also reports a failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-store-"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const writeFailure = new Error("write failed");
    vi.mocked(writeFile).mockImplementationOnce(async (path) => {
      await actual.writeFile(path, "{ partial", "utf8");
      throw writeFailure;
    });
    vi.mocked(rm).mockImplementationOnce(async (path, options) => {
      await actual.rm(path, options);
      throw new Error("cleanup reported a failure");
    });

    await expect(new ProjectStore(root).save(manifest)).rejects.toBe(writeFailure);

    expect(await readdir(join(root, ".creative-preproduction"))).toEqual([]);
  });

  it("cleans initializer temporary and lock files after a partial write failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-init-"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const writeFailure = new Error("initializer write failed");
    vi.mocked(writeFile).mockImplementationOnce(async (path) => {
      await actual.writeFile(path, "{ partial", "utf8");
      throw writeFailure;
    });

    await expect(initializeProject({ root, ...manifest.project })).rejects.toBe(writeFailure);

    expect((await readdir(join(root, ".creative-preproduction"))).sort()).toEqual([
      "asset-dossier.md", "brief.md", "decision-journal.md", "private", "research-board.md"
    ]);
    expect(await readdir(join(root, ".creative-preproduction", "private"))).toEqual([".gitignore"]);
  });
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe("exclusive manifest writes", () => {
  it.each([
    ["save", "save"],
    ["initialize", "initialize"],
    ["initialize", "save"],
    ["save", "initialize"]
  ] as const)("rejects overlapping %s / %s writers without corrupting the manifest", async (first, second) => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-concurrency-"));
    const workspace = join(root, ".creative-preproduction");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const temporaryWritten = deferred();
    const resume = deferred();
    const runWriter = (kind: "save" | "initialize", name: string) => kind === "save"
      ? new ProjectStore(root).save({ ...manifest, project: { ...manifest.project, name } })
      : initializeProject({ root, ...manifest.project, name, now: new Date(manifest.createdAt) });
    vi.mocked(writeFile).mockImplementationOnce(async (path, contents, options) => {
      await actual.writeFile(path, contents, options);
      temporaryWritten.resolve();
      await resume.promise;
    });
    // Capture rejection immediately so the intentionally broken implementation also settles cleanly.
    const firstWrite = runWriter(first, "First writer").then(
      () => ({ succeeded: true }),
      (error: unknown) => ({ succeeded: false, error })
    );

    try {
      await temporaryWritten.promise;
      await expect(readFile(join(workspace, "manifest.json"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expect(runWriter(second, "Second writer")).rejects.toThrow(/another writer/i);
      const files = await readdir(workspace);
      const temporaryFiles = files.filter((name) => name.endsWith(".tmp"));
      expect(temporaryFiles).toHaveLength(1);
      expect(temporaryFiles[0]).toMatch(/^manifest\.json\..+\.tmp$/);
      expect(files).toContain("manifest.json.lock");
    } finally {
      resume.resolve();
      await firstWrite;
    }

    expect(await firstWrite).toEqual({ succeeded: true });
    expect(JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8"))).toEqual({
      ...manifest, harnessVersion: first === "initialize" ? (await findHarnessPackage()).version : manifest.harnessVersion,
      project: { ...manifest.project, name: "First writer" }
    });
    expect((await readdir(workspace)).filter((name) => name.endsWith(".tmp") || name.endsWith(".lock")))
      .toEqual([]);
    // Releasing the successful writer's lock permits a later writer.
    await new ProjectStore(root).save(manifest);
    expect(await new ProjectStore(root).load()).toEqual(manifest);
  });
});
