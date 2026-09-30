import { mkdir, mkdtemp, lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDoctorCommand } from "../../src/commands/doctor.js";
import { inspectManifestLock, recoverManifestLock } from "../../src/storage/manifest-lock.js";
import { withManifestLock } from "../../src/storage/manifest-write.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat), readFile: vi.fn(actual.readFile), rm: vi.fn(actual.rm) };
});
const roots: string[] = [];
async function paths() {
  const root = await mkdtemp(join(tmpdir(), "manifest-lock-"));
  roots.push(root);
  const workspace = join(root, ".creative-preproduction");
  await mkdir(workspace);
  return { root, workspace, manifest: join(workspace, "manifest.json") };
}
const deadOwner = () => JSON.stringify({ version: 1, pid: 2147483647, hostname: hostname(),
  token: "dead-owner", startedAt: "2026-09-30T18:00:00.000Z" });
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("manifest lock coordination", () => {
  it("cleans its acquired lock if the recovery-marker recheck fails", async () => {
    const path = await paths();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let markerChecks = 0;
    vi.mocked(lstat).mockImplementation(async (...arguments_: Parameters<typeof lstat>) => {
      if (String(arguments_[0]) === `${path.manifest}.lock.recovery` && ++markerChecks === 2) {
        throw Object.assign(new Error("Cannot inspect recovery marker"), { code: "EACCES" });
      }
      return actual.lstat(...arguments_);
    });
    await expect(withManifestLock(path.manifest, async () => true)).rejects.toThrow("Cannot inspect recovery marker");
    expect(await readdir(path.workspace)).toEqual([]);
  });

  it("excludes competing recovery and acquisition until recovery finishes", async () => {
    const path = await paths();
    await writeFile(`${path.manifest}.lock`, deadOwner());
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const removing = deferred();
    const resume = deferred();
    vi.mocked(rm).mockImplementation(async (...arguments_: Parameters<typeof rm>) => {
      if (String(arguments_[0]) === `${path.manifest}.lock`) {
        removing.resolve();
        await resume.promise;
      }
      return actual.rm(...arguments_);
    });
    const recovery = recoverManifestLock(path.manifest);
    try {
      await removing.promise;
      await expect(recoverManifestLock(path.manifest)).rejects.toThrow(/another lock recovery/i);
      await expect(withManifestLock(path.manifest, async () => true)).rejects.toThrow(/another writer/i);
      expect(await readFile(`${path.manifest}.lock`, "utf8")).toBe(deadOwner());
    } finally { resume.resolve(); }
    expect(await recovery).toBe(true);
    await withManifestLock(path.manifest, async () => {
      const replacement = await readFile(`${path.manifest}.lock`, "utf8");
      await expect(recoverManifestLock(path.manifest)).rejects.toThrow(/live/i);
      expect(await readFile(`${path.manifest}.lock`, "utf8")).toBe(replacement);
    });
  });

  it("does not delete a replacement lock when releasing its own lock", async () => {
    const path = await paths();
    await withManifestLock(path.manifest, async () => {
      await rename(`${path.manifest}.lock`, `${path.manifest}.old-lock`);
      await writeFile(`${path.manifest}.lock`, "Replacement writer", { flag: "wx" });
    });
    expect(await readFile(`${path.manifest}.lock`, "utf8")).toBe("Replacement writer");
  });

  it("refuses uncertain process state even for an old lock", async () => {
    const path = await paths();
    await writeFile(`${path.manifest}.lock`, deadOwner());
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("Permission denied"), { code: "EPERM" }); });
    expect((await inspectManifestLock(path.manifest)).state).toBe("uncertain");
    await expect(recoverManifestLock(path.manifest)).rejects.toThrow(/cannot determine/i);
    expect(await readFile(`${path.manifest}.lock`, "utf8")).toBe(deadOwner());
  });
});

describe("doctor command", () => {
  it("reports installation version, Node requirements, and templates without creating an uninitialized project", async () => {
    const root = await mkdtemp(join(tmpdir(), "doctor-uninitialized-"));
    roots.push(root);
    const uninitialized = join(root, "not-created");
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
    const program = new Command();
    registerDoctorCommand(program);
    await program.parseAsync(["node", "creative-preproduction", "doctor", "--root", uninitialized]);
    expect(output).toContain("Harness 0.3.0");
    expect(output).toContain(`Node ${process.version}`);
    expect(output).toContain("required >=22.12.0");
    expect(output).toContain("Templates available: brief.md, decision-journal.md, research-board.md, asset-dossier.md");
    expect(await readdir(root)).toEqual([]);
  });

  it("reports unavailable installation templates as a blocking diagnostic", async () => {
    const path = await paths();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(readFile).mockImplementation(async (...arguments_: Parameters<typeof readFile>) => {
      if (String(arguments_[0]).endsWith(join("templates", "brief.md"))) {
        throw Object.assign(new Error("Template absent"), { code: "ENOENT" });
      }
      return actual.readFile(...arguments_);
    });
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
    const program = new Command();
    registerDoctorCommand(program);
    await program.parseAsync(["node", "creative-preproduction", "doctor", "--root", path.root]);
    expect(output).toContain("Templates unavailable: brief.md");
    expect(process.exitCode).toBe(1);
    expect(await readdir(path.workspace)).toEqual([]);
  });

  it("inspects a dead writer without changing files or replaying a pending journal", async () => {
    const path = await paths();
    await writeFile(path.manifest, '{"schemaVersion":2}');
    await writeFile(`${path.manifest}.lock`, deadOwner());
    await writeFile(join(path.workspace, "asset-transaction.json"), "Pending journal bytes");
    const before = await readdir(path.workspace);
    const lockBefore = await readFile(`${path.manifest}.lock`, "utf8");
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
    const program = new Command();
    registerDoctorCommand(program);
    await program.parseAsync(["node", "creative-preproduction", "doctor", "--root", path.root]);
    expect(output).toContain("Lock dead:");
    expect(output).toContain("--recover-lock");
    expect(process.exitCode).toBe(1);
    expect(await readdir(path.workspace)).toEqual(before);
    expect(await readFile(`${path.manifest}.lock`, "utf8")).toBe(lockBefore);
    expect(await readFile(path.manifest, "utf8")).toBe('{"schemaVersion":2}');
    expect(await readFile(join(path.workspace, "asset-transaction.json"), "utf8")).toBe("Pending journal bytes");
  });
});
