import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../../src/cli.js";
import type { ArtifactKind, Stage } from "../../src/domain/schema.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const roots: string[] = [];
const originalExitCode = process.exitCode;

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function run(root: string, ...args: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  await createProgram().parseAsync(["node", "creative-preproduction", ...args, "--root", root]);
  return output.join("");
}

async function register(root: string, id: string, kind: ArtifactKind): Promise<void> {
  await writeFile(join(root, "direction", `${id}-v1.md`), `# ${id}\nOriginal project reasoning and decisions.\n`);
  await run(root, "artifact", "add", "--id", id, "--kind", kind,
    "--path", `direction/${id}-v1.md`, "--rationale", "Document the project decision for the next stage.");
}

async function approve(root: string, id: string, tier: "self" | "peer"): Promise<void> {
  await run(root, "artifact", "submit", "--id", id, "--version", "1");
  await run(root, "review", "--artifact", id, "--version", "1", "--tier", tier,
    "--decision", "approved", "--reviewer", "Mina", "--reason", "The documented decisions meet this stage's requirements.");
}

async function advance(root: string, to: Stage): Promise<void> {
  const before = (await new ProjectStore(root).load()).stage;
  expect(await run(root, "stage", "check", "--to", to)).toContain("Can advance");
  expect((await new ProjectStore(root).load()).stage).toBe(before);
  await run(root, "stage", "advance", "--to", to);
  expect((await new ProjectStore(root).load()).stage).toBe(to);
}

describe("public explicit CLI workflow", () => {
  it("takes an existing-site project from an audit and brief to peer-approved implementation handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-existing-site-"));
    roots.push(root);
    await mkdir(join(root, "direction"));
    await run(root, "init", "--id", "field-notes", "--name", "Field Notes", "--kind", "existing-site");
    await register(root, "audit", "existing-site-audit");
    await approve(root, "audit", "self");
    await register(root, "brief", "creative-brief");
    await approve(root, "brief", "self");
    await advance(root, "research");

    await run(root, "reference", "add", "--id", "archive", "--url", "https://example.com/archive",
      "--title", "Archive rhythm", "--relevance", "Metadata hierarchy", "--lesson", "Keep details scannable",
      "--avoid-copying", "Original typography and imagery", "--attribution", "Example Archive",
      "--license-status", "not-applicable", "--license-notes", "Reference only; no reuse.");
    await register(root, "research", "research-board");
    await approve(root, "research", "self");
    await advance(root, "territories");

    await register(root, "territory-a", "creative-territory");
    await register(root, "territory-b", "creative-territory");
    await approve(root, "territory-a", "self");
    await advance(root, "visual-language");
    await register(root, "language", "visual-language");
    await approve(root, "language", "self");
    await advance(root, "exploration");

    await register(root, "study", "composition-study");
    await run(root, "artifact", "submit", "--id", "study", "--version", "1");
    await advance(root, "review");
    await register(root, "handoff", "implementation-handoff");
    await approve(root, "handoff", "peer");
    await advance(root, "handoff");

    const manifest = await new ProjectStore(root).load();
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.artifacts).toHaveLength(8);
    expect(manifest.approvals).toHaveLength(6);
    expect(manifest.artifacts.find((artifact) => artifact.id === "territory-b")?.status).toBe("draft");
    expect(manifest.artifacts.find((artifact) => artifact.id === "study")?.status).toBe("in-review");
    expect(JSON.parse(await run(root, "artifact", "show", "--id", "handoff", "--version", "1")))
      .toMatchObject({ artifact: { status: "approved" }, reviews: [{ tier: "peer", decision: "approved" }] });
    expect(await run(root, "validate")).toBe("");
  });
});
