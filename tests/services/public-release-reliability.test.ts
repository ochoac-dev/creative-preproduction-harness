import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import { canTransition } from "../../src/domain/workflow.js";
import type { ArtifactRecord, AssetRecord, ProjectManifest } from "../../src/domain/schema.js";
import { validateProject } from "../../src/services/validation.js";
import { addProjectArtifact } from "../../src/services/workflow-actions.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { withManifestLock } from "../../src/storage/manifest-write.js";
import * as lockOperations from "../../src/storage/manifest-write.js";

const now = "2026-09-30T18:00:00.000Z";
const roots: string[] = [];
async function root(): Promise<string> {
  const result = await mkdtemp(join(tmpdir(), "public-release-reliability-"));
  roots.push(result);
  return result;
}
function artifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return { id: "handoff", kind: "implementation-handoff", version: 1, path: "handoff.md",
    status: "approved", visibility: "project", assetIds: [], rationale: "Ready for implementation.",
    createdAt: now, updatedAt: now, ...overrides };
}
function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return { id: "portrait", title: "Portrait", source: "Original work", intendedRole: "Lead image",
    modificationPolicy: "adaptable", rightsStatus: "cleared", providerScopes: ["manual"],
    storage: { kind: "managed", path: "portrait.jpg" }, allowedTreatments: [], prohibitedTreatments: [],
    visualNotes: {}, responsiveGuidance: "Keep visible.", accessibilityIntent: "Describe portrait.",
    relatedArtifactIds: [], relatedFeedbackIds: [], unresolvedQuestions: [], createdAt: now, updatedAt: now,
    ...overrides };
}
function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return { schemaVersion: 2, harnessVersion: "0.3.0", project: { id: "project", name: "Project", kind: "new-site" },
    stage: "review", participants: [], decisionOwners: [], artifacts: [], approvals: [], assets: [],
    references: [], feedback: [], unresolvedQuestions: [], createdAt: now, updatedAt: now, ...overrides };
}
function readyHandoff(ids: string[]): ProjectManifest {
  const handoff = artifact({ assetIds: ids, provider: "manual" });
  return manifest({ artifacts: [handoff], approvals: [{ id: "approval", artifactId: "handoff",
    artifactVersion: 1, tier: "creative-lead", decision: "approved", reviewer: "Reviewer",
    reason: "Ready.", createdAt: now }] });
}
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("release reference integrity", () => {
  it("blocks missing asset references in validation and handoff advancement", async () => {
    const directory = await root();
    await writeFile(join(directory, "handoff.md"), "Handoff");
    const project = readyHandoff(["missing-asset"]);
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "asset-reference-missing", severity: "error", subjectId: "handoff"
    }));
    expect(canTransition(project, "handoff")).toMatchObject({ allowed: false });
  });

  it("blocks missing assets on private and project artifacts", async () => {
    const directory = await root();
    await writeFile(join(directory, "draft.md"), "Draft");
    const project = manifest({ artifacts: [artifact({ id: "draft", kind: "creative-brief",
      path: "draft.md", status: "draft", assetIds: ["absent"] })] });
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "asset-reference-missing", severity: "error", subjectId: "draft"
    }));
  });

  it("accepts approved legacy artifact IDs in handoff with a deprecation warning", async () => {
    const directory = await root();
    await writeFile(join(directory, "handoff.md"), "Handoff");
    await writeFile(join(directory, "study.md"), "Study");
    const project = readyHandoff(["study"]);
    project.artifacts.push(artifact({ id: "study", kind: "composition-study", path: "study.md" }));
    const diagnostics = await validateProject(directory, project);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: "legacy-handoff-artifact-reference", severity: "warning", subjectId: "handoff"
    }));
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(canTransition(project, "handoff")).toEqual({ allowed: true, reasons: [] });
  });

  it.each(["draft", "in-review", "superseded"] as const)("blocks a legacy handoff reference to a %s artifact", async (status) => {
    const directory = await root();
    await writeFile(join(directory, "handoff.md"), "Handoff");
    await writeFile(join(directory, "study.md"), "Study");
    const project = readyHandoff(["study"]);
    project.artifacts.push(artifact({ id: "study", kind: "composition-study", path: "study.md", status }));
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "handoff-artifact-unapproved", severity: "error", subjectId: "study"
    }));
    expect(canTransition(project, "handoff")).toMatchObject({ allowed: false });
  });

  it("reports a missing managed asset file", async () => {
    const directory = await root();
    expect(await validateProject(directory, manifest({ assets: [asset()] })))
      .toContainEqual(expect.objectContaining({ code: "asset-file-missing", severity: "error", subjectId: "portrait" }));
  });

  it("blocks missing artifact and feedback relationship IDs", async () => {
    const directory = await root();
    await writeFile(join(directory, "portrait.jpg"), "Portrait");
    const project = manifest({ assets: [asset({ relatedArtifactIds: ["absent-artifact"], relatedFeedbackIds: ["absent-feedback"] })],
      feedback: [{ id: "feedback", source: "Review", originalText: "Revise it.", classifications: ["requested-change"],
        interpretation: "Needs revision.", target: { kind: "project", id: "project" }, resolutionStatus: "resolved",
        resultingArtifactIds: ["absent-revision"], createdAt: now, updatedAt: now }] });
    const errors = (await validateProject(directory, project)).filter((diagnostic) => diagnostic.severity === "error");
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "artifact-reference-missing", subjectId: "portrait" }),
      expect.objectContaining({ code: "feedback-reference-missing", subjectId: "portrait" }),
      expect.objectContaining({ code: "artifact-reference-missing", subjectId: "feedback" })
    ]));
  });
});

describe("release artifact file safety", () => {
  it.each(["registration", "promotion"])("rejects %s of a retained private asset source after rights clearance", async (operation) => {
    const directory = await root();
    const retainedPath = ".creative-preproduction/private/assets/portrait/source";
    const studyPath = ".creative-preproduction/private/studies/study/v1/index.html";
    await mkdir(join(directory, retainedPath, ".."), { recursive: true });
    await mkdir(join(directory, studyPath, ".."), { recursive: true });
    await writeFile(join(directory, retainedPath), "Retained private source");
    await writeFile(join(directory, studyPath), "Private study");
    await writeFile(join(directory, "portrait.jpg"), "Separate cleared copy");
    const study = artifact({ id: "study", kind: "composition-study", path: studyPath,
      status: "provisional", visibility: "private", question: "Does it work?", assumptions: [], blockers: [] });
    const store = new ProjectStore(directory);
    await store.save(manifest({ artifacts: [study], assets: [asset({ rightsStatus: "unknown",
      providerScopes: ["local-html-svg"], storage: { kind: "private", ref: "portrait" } })] }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createProgram().parseAsync(["node", "creative-preproduction", "asset", "update", "--root", directory,
      "--id", "portrait", "--rights", "cleared", "--provider", "manual", "--path", "portrait.jpg"]);
    const cleared = await store.load();
    expect(cleared.assets[0]?.storage).toEqual({ kind: "managed", path: "portrait.jpg" });
    expect(await readFile(join(directory, retainedPath), "utf8")).toBe("Retained private source");
    await link(join(directory, retainedPath), join(directory, "retained-alias.md"));
    const result = await (operation === "registration"
      ? addProjectArtifact(store, { id: "brief", kind: "creative-brief", path: "retained-alias.md", rationale: "Frame it." })
      : createProgram().parseAsync(["node", "creative-preproduction", "promote", "--root", directory,
          "--artifact", "study", "--version", "1", "--path", "retained-alias.md", "--rationale", "Review this copy."]))
      .then(() => undefined, (error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
    expect(await store.load()).toEqual(cleared);
    expect(await readFile(join(directory, retainedPath), "utf8")).toBe("Retained private source");
  });

  it("accepts a public-only hardlink that does not alias private bytes or another artifact", async () => {
    const directory = await root();
    await mkdir(join(directory, ".creative-preproduction/private/assets/untracked"), { recursive: true });
    await writeFile(join(directory, ".creative-preproduction/private/assets/untracked/source"), "Unrelated private bytes");
    await writeFile(join(directory, "original.md"), "Public source");
    await link(join(directory, "original.md"), join(directory, "brief.md"));
    const store = new ProjectStore(directory);
    await store.save(manifest());
    const saved = await addProjectArtifact(store, { id: "brief", kind: "creative-brief", path: "brief.md", rationale: "Frame it." });
    expect(saved.artifacts[0]?.path).toBe("brief.md");
  });

  it("refuses a multiply linked project file when the private scan encounters a symlinked directory", async () => {
    const directory = await root();
    const outside = await root();
    await mkdir(join(directory, ".creative-preproduction/private"), { recursive: true });
    await writeFile(join(directory, "original.md"), "Public source");
    await link(join(directory, "original.md"), join(directory, "brief.md"));
    await symlink(outside, join(directory, ".creative-preproduction/private/linked"), process.platform === "win32" ? "junction" : "dir");
    const store = new ProjectStore(directory);
    await store.save(manifest());
    await expect(addProjectArtifact(store, { id: "brief", kind: "creative-brief", path: "brief.md", rationale: "Frame it." }))
      .rejects.toThrow(/linked|symlink/i);
    expect((await store.load()).artifacts).toEqual([]);
  });

  it.each(["other private study", "approved brief", "draft artifact", "private asset"])(
    "rejects promotion hardlinked to a %s without changing the manifest", async (owner) => {
      const directory = await root();
      const privatePath = ".creative-preproduction/private/studies/study/v1/index.html";
      await mkdir(join(directory, privatePath, ".."), { recursive: true });
      await writeFile(join(directory, privatePath), "Selected private study");
      const study = artifact({ id: "study", kind: "composition-study", path: privatePath,
        status: "provisional", visibility: "private", question: "Does it work?", assumptions: [], blockers: [] });
      const project = manifest({ artifacts: [study] });
      const ownerPath = owner === "other private study" ? ".creative-preproduction/private/studies/other/v1/index.html"
        : owner === "private asset" ? ".creative-preproduction/private/assets/portrait/source" : "brief.md";
      await mkdir(join(directory, ownerPath, ".."), { recursive: true });
      await writeFile(join(directory, ownerPath), "Owned source bytes");
      if (owner === "private asset") project.assets.push(asset({ storage: { kind: "private", ref: "portrait" } }));
      else project.artifacts.push(artifact({ id: "other", kind: "creative-brief", path: ownerPath,
        status: owner === "other private study" ? "provisional" : owner === "draft artifact" ? "draft" : "approved",
        visibility: owner === "other private study" ? "private" : "project",
        ...(owner === "other private study" ? { question: "Try another direction?", assumptions: [], blockers: [] } : {}) }));
      await link(join(directory, ownerPath), join(directory, "reviewed.html"));
      const store = new ProjectStore(directory);
      await store.save(project);
      const before = await readFile(join(directory, ".creative-preproduction/manifest.json"), "utf8");
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const result = await createProgram().parseAsync(["node", "creative-preproduction", "promote", "--root", directory,
        "--artifact", "study", "--version", "1", "--path", "reviewed.html", "--rationale", "Review this copy."])
        .then(() => undefined, (error: unknown) => error);
      expect(result).toBeInstanceOf(Error);
      expect(await readFile(join(directory, ".creative-preproduction/manifest.json"), "utf8")).toBe(before);
      expect(await readFile(join(directory, ownerPath), "utf8")).toBe("Owned source bytes");
      expect(await readFile(join(directory, privatePath), "utf8")).toBe("Selected private study");
    }
  );

  it("rejects already tracked public versions that alias an approved artifact file", async () => {
    const directory = await root();
    await writeFile(join(directory, "brief-v1.md"), "Approved brief");
    await link(join(directory, "brief-v1.md"), join(directory, "brief-v2.md"));
    const project = manifest({ artifacts: [
      artifact({ id: "brief", kind: "creative-brief", path: "brief-v1.md" }),
      artifact({ id: "brief", kind: "creative-brief", version: 2, parentVersion: 1,
        path: "brief-v2.md", status: "draft" })
    ] });
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "tracked-path-unsafe", severity: "error", subjectId: "brief"
    }));
  });

  it.each(["symlink", "hardlink", "directory"])("rejects promotion through a %s without saving a version", async (kind) => {
    const directory = await root();
    const sourcePath = ".creative-preproduction/private/studies/study/v1/index.html";
    const privateSource = join(directory, sourcePath);
    await mkdir(join(privateSource, ".."), { recursive: true });
    await writeFile(privateSource, "Private source");
    const destination = join(directory, "reviewed.html");
    if (kind === "symlink") await symlink(privateSource, destination);
    if (kind === "hardlink") await link(privateSource, destination);
    if (kind === "directory") await mkdir(destination);
    const study = artifact({ id: "study", kind: "composition-study", path: sourcePath,
      status: "provisional", visibility: "private", question: "Does it work?", assumptions: [], blockers: [] });
    const store = new ProjectStore(directory);
    await store.save(manifest({ artifacts: [study] }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(createProgram().parseAsync(["node", "creative-preproduction", "promote", "--root", directory,
      "--artifact", "study", "--version", "1", "--path", "reviewed.html", "--rationale", "Review this copy."]))
      .rejects.toThrow(/regular|link|private/i);
    expect((await store.load()).artifacts).toHaveLength(1);
    expect(await readFile(privateSource, "utf8")).toBe("Private source");
  });

  it("rejects a project artifact beneath a symlink even if it resolves inside the project", async () => {
    const directory = await root();
    await mkdir(join(directory, "actual"));
    await writeFile(join(directory, "actual", "study.md"), "Study");
    await symlink(join(directory, "actual"), join(directory, "linked"), process.platform === "win32" ? "junction" : "dir");
    const project = manifest({ artifacts: [artifact({ path: "linked/study.md" })] });
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "tracked-path-unsafe", severity: "error", subjectId: "handoff"
    }));
  });

  it("rejects a tracked promoted artifact hardlinked to its private parent", async () => {
    const directory = await root();
    const sourcePath = ".creative-preproduction/private/studies/study/v1/index.html";
    await mkdir(join(directory, sourcePath, ".."), { recursive: true });
    await writeFile(join(directory, sourcePath), "Private source");
    await link(join(directory, sourcePath), join(directory, "study-v2.html"));
    const privateStudy = artifact({ id: "study", kind: "composition-study", path: sourcePath,
      status: "provisional", visibility: "private", question: "Does it work?", assumptions: [], blockers: [] });
    const project = manifest({ artifacts: [privateStudy,
      artifact({ id: "study", kind: "composition-study", version: 2, parentVersion: 1,
        path: "study-v2.html", status: "draft" })] });
    expect(await validateProject(directory, project)).toContainEqual(expect.objectContaining({
      code: "tracked-path-unsafe", severity: "error", subjectId: "study"
    }));
  });
});

describe("release manifest lock ownership", () => {
  it("records identity metadata while a writer holds the lock", async () => {
    const directory = await root();
    const manifestPath = join(directory, ".creative-preproduction", "manifest.json");
    await withManifestLock(manifestPath, async () => {
      const contents = await readFile(`${manifestPath}.lock`, "utf8");
      expect(contents.length).toBeGreaterThan(0);
      const owner = JSON.parse(contents);
      expect(owner).toMatchObject({ version: 1, pid: process.pid, hostname: hostname() });
      expect(owner.token).toEqual(expect.any(String));
      expect(Number.isFinite(Date.parse(owner.startedAt))).toBe(true);
    });
  });

  it("recovers only a provably dead local owner and enables a later writer", async () => {
    const directory = await root();
    const manifestPath = join(directory, ".creative-preproduction", "manifest.json");
    await mkdir(join(manifestPath, ".."), { recursive: true });
    await writeFile(`${manifestPath}.lock`, JSON.stringify({ version: 1, pid: 2147483647,
      hostname: hostname(), token: "dead-writer", startedAt: now }));
    await expect(withManifestLock(manifestPath, async () => true)).rejects.toThrow(/another writer/i);
    const recover = (lockOperations as unknown as { recoverManifestLock?: (path: string) => Promise<boolean> }).recoverManifestLock;
    expect(recover).toBeTypeOf("function");
    expect(await recover!(manifestPath)).toBe(true);
    expect(await withManifestLock(manifestPath, async () => "saved")).toBe("saved");
  });

  it.each([
    ["live owner", { version: 1, pid: process.pid, hostname: hostname(), token: "live", startedAt: "2000-01-01T00:00:00.000Z" }],
    ["foreign host", { version: 1, pid: 2147483647, hostname: "other-host", token: "foreign", startedAt: now }],
    ["legacy lock", ""],
    ["malformed lock", "invalid"]
  ])("refuses recovery of a %s without changing it", async (_name, owner) => {
    const directory = await root();
    const manifestPath = join(directory, ".creative-preproduction", "manifest.json");
    await mkdir(join(manifestPath, ".."), { recursive: true });
    const contents = typeof owner === "string" ? owner : JSON.stringify(owner);
    await writeFile(`${manifestPath}.lock`, contents);
    const recover = (lockOperations as unknown as { recoverManifestLock?: (path: string) => Promise<boolean> }).recoverManifestLock;
    expect(recover).toBeTypeOf("function");
    await expect(recover!(manifestPath)).rejects.toThrow(/live|uncertain|legacy|host|metadata/i);
    expect(await readFile(`${manifestPath}.lock`, "utf8")).toBe(contents);
  });
});
