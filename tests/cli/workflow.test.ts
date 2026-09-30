import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerArtifactCommands } from "../../src/commands/artifacts.js";
import { registerReferenceCommands } from "../../src/commands/references.js";
import { registerStageCommands } from "../../src/commands/stages.js";
import { applyReviewDecision } from "../../src/services/artifacts.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const roots: string[] = [];
const exitCode = process.exitCode;

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = exitCode;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "creative-workflow-cli-"));
  roots.push(root);
  await initializeProject({ root, id: "field-notes", name: "Field Notes", kind: "new-site" });
  await mkdir(join(root, "direction"));
  await writeFile(join(root, "direction/brief-v1.md"), "# Brief\nIdentify the audience.");
  await writeFile(join(root, "direction/brief-v2.md"), "# Brief\nFocus on local participation.");
  return root;
}

async function runCli(...args: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  const program = new Command().exitOverride();
  registerArtifactCommands(program);
  registerReferenceCommands(program);
  registerStageCommands(program);
  await program.parseAsync(["node", "creative-preproduction", ...args]);
  return output.join("");
}

async function addBrief(root: string): Promise<string> {
  return runCli("artifact", "add", "--root", root, "--id", "brief", "--kind", "creative-brief",
    "--path", "direction/brief-v1.md", "--rationale", "Clarify scope before research.");
}

describe("explicit workflow commands", () => {
  it("adds, revises, and submits exact artifact versions without approving them", async () => {
    const root = await projectRoot();
    expect(await addBrief(root)).toContain("Added artifact brief v1");
    expect(await runCli("artifact", "revise", "--root", root, "--id", "brief", "--version", "1",
      "--path", "direction/brief-v2.md", "--rationale", "Focus the audience."))
      .toContain("Revised artifact brief to v2");
    expect(await runCli("artifact", "submit", "--root", root, "--id", "brief", "--version", "2"))
      .toContain("Submitted artifact brief v2");
    const manifest = await new ProjectStore(root).load();
    expect(manifest.artifacts.map(({ version, status }) => ({ version, status })))
      .toEqual([{ version: 1, status: "draft" }, { version: 2, status: "in-review" }]);
    expect(manifest.approvals).toEqual([]);
  });

  it("shows artifact metadata and review evidence for an exact version", async () => {
    const root = await projectRoot();
    await addBrief(root);
    await new ProjectStore(root).mutate((manifest) => applyReviewDecision(manifest, {
      artifactId: "brief", artifactVersion: 1, tier: "self", decision: "approved", reviewer: "Mina", reason: "Audience is clear."
    }));
    const listed = await runCli("artifact", "list", "--root", root);
    expect(listed).toContain("brief");
    expect(listed).toContain("creative-brief");
    expect(listed).toContain("approved");
    expect(listed).toContain("direction/brief-v1.md");
    const detail = JSON.parse(await runCli("artifact", "show", "--root", root, "--id", "brief", "--version", "1"));
    expect(detail.artifact).toMatchObject({ id: "brief", version: 1, status: "approved", rationale: "Clarify scope before research." });
    expect(detail.reviews).toEqual([expect.objectContaining({ reviewer: "Mina", tier: "self", reason: "Audience is clear." })]);
    await expect(runCli("artifact", "show", "--root", root, "--id", "brief", "--version", "2"))
      .rejects.toThrow(/does not exist/i);
  });

  it("stores and lists all reference reasoning and licensing fields", async () => {
    const root = await projectRoot();
    await runCli("reference", "add", "--root", root, "--id", "archive", "--url", "https://example.com/archive",
      "--title", "Archive rhythm", "--relevance", "Editorial hierarchy", "--lesson", "Group metadata",
      "--avoid-copying", "Typography and imagery", "--attribution", "Example Archive",
      "--license-status", "unknown", "--license-notes", "Reference only; verify before reuse.");
    const references = JSON.parse(await runCli("reference", "list", "--root", root));
    expect(references).toEqual([{
      id: "archive", url: "https://example.com/archive", title: "Archive rhythm", relevance: "Editorial hierarchy",
      lesson: "Group metadata", avoidCopying: "Typography and imagery", attribution: "Example Archive",
      licenseStatus: "unknown", licenseNotes: "Reference only; verify before reuse."
    }]);
    expect((await new ProjectStore(root).load()).references).toEqual(references);
  });

  it("checks without saving and makes stage advancement explicit", async () => {
    const root = await projectRoot();
    await addBrief(root);
    expect(await runCli("stage", "check", "--root", root, "--to", "research")).toContain("approved creative-brief");
    expect(process.exitCode).toBe(1);
    expect((await new ProjectStore(root).load()).stage).toBe("brief");
    process.exitCode = exitCode;
    await new ProjectStore(root).mutate((manifest) => applyReviewDecision(manifest, {
      artifactId: "brief", artifactVersion: 1, tier: "self", decision: "approved", reviewer: "Mina", reason: "Audience is clear."
    }));
    expect(await runCli("stage", "check", "--root", root, "--to", "research")).toContain("Can advance");
    expect((await new ProjectStore(root).load()).stage).toBe("brief");
    expect(await runCli("stage", "advance", "--root", root, "--to", "research")).toContain("Advanced to stage research");
    expect((await new ProjectStore(root).load()).stage).toBe("research");
    await expect(runCli("stage", "advance", "--root", root, "--to", "brief")).rejects.toThrow(/adjacent|forward/i);
  });
});
