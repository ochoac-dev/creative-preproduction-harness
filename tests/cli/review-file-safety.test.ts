import { link, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import type { AssetRecord } from "../../src/domain/schema.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const roots: string[] = [];
const now = "2026-09-30T18:00:00.000Z";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function run(root: string, ...args: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  await createProgram().parseAsync(["node", "creative-preproduction", ...args, "--root", root]);
  return output.join("");
}

async function project(owner: "private asset" | "private study"): Promise<{ root: string; source: string; store: ProjectStore }> {
  const root = await mkdtemp(join(tmpdir(), "creative-review-file-safety-"));
  roots.push(root);
  await run(root, "init", "--id", "field-notes", "--name", "Field Notes", "--kind", "new-site");
  await mkdir(join(root, "direction"));
  await writeFile(join(root, "direction/language.md"), "Public visual language.");
  const source = owner === "private asset"
    ? ".creative-preproduction/private/assets/portrait/source"
    : ".creative-preproduction/private/studies/private-study/v1/index.html";
  await mkdir(join(root, source, ".."), { recursive: true });
  await writeFile(join(root, source), "PRIVATE REVIEW MARKER: never expose these bytes.");
  const store = new ProjectStore(root);
  await store.mutate((manifest) => owner === "private study" ? {
    ...manifest, artifacts: [{
      id: "private-study", kind: "composition-study", version: 1, path: source, status: "provisional", visibility: "private",
      assetIds: [], question: "Can the private image work?", assumptions: [], blockers: [], rationale: "Private exploration.",
      createdAt: now, updatedAt: now
    }]
  } : { ...manifest, assets: [privateAsset()] });
  await run(root, "artifact", "add", "--id", "language", "--kind", "visual-language",
    "--path", "direction/language.md", "--rationale", "Define the project language.");
  await run(root, "artifact", "submit", "--id", "language", "--version", "1");
  return { root, source, store };
}

function privateAsset(): AssetRecord {
  return {
    id: "portrait", title: "Portrait", source: "Client supplied", intendedRole: "Private exploration",
    rightsStatus: "unknown", modificationPolicy: "adaptable", providerScopes: ["local-html-svg"],
    storage: { kind: "private", ref: "portrait" }, allowedTreatments: [], prohibitedTreatments: [], visualNotes: {},
    responsiveGuidance: "Keep private.", accessibilityIntent: "Keep private.", relatedArtifactIds: [], relatedFeedbackIds: [],
    unresolvedQuestions: [], createdAt: now, updatedAt: now
  };
}

function review(root: string, decision: "approved" | "approved-with-conditions" | "returned"): Promise<string> {
  return run(root, "review", "--artifact", "language", "--version", "1", "--tier", "creative-lead",
    "--decision", decision, "--reviewer", "Mina", "--reason", "Review the documented visual language.");
}

describe("reviewed project file safety", () => {
  it.each(["private asset", "private study"] as const)("rejects an approving review after replacement by a hard link to a %s", async (owner) => {
    const { root, source, store } = await project(owner);
    const before = await store.load();
    await rm(join(root, "direction/language.md"));
    await link(join(root, source), join(root, "direction/language.md"));
    await expect(review(root, "approved")).rejects.toThrow(/private|hard link|separate copy/i);
    await expect(review(root, "approved-with-conditions")).rejects.toThrow(/private|hard link|separate copy/i);
    expect(await store.load()).toEqual(before);
  });

  it("rejects approval when the submitted file no longer exists, preserving prior review history", async () => {
    const { root, store } = await project("private study");
    await review(root, "approved-with-conditions");
    const before = await store.load();
    await rm(join(root, "direction/language.md"));
    await expect(review(root, "approved")).rejects.toThrow();
    expect(await store.load()).toEqual(before);
  });

  it("allows a return decision on a missing file so a reviewer can record remediation", async () => {
    const { root, store } = await project("private study");
    await rm(join(root, "direction/language.md"));
    await review(root, "returned");
    const manifest = await store.load();
    expect(manifest.artifacts.find((artifact) => artifact.id === "language")?.status).toBe("draft");
    expect(manifest.approvals).toEqual([expect.objectContaining({ decision: "returned", reviewer: "Mina" })]);
  });

  it("withholds private bytes from CLI context after an approved file is replaced by a hard link", async () => {
    const { root, source, store } = await project("private asset");
    await review(root, "approved");
    const before = await store.load();
    await rm(join(root, "direction/language.md"));
    await link(join(root, source), join(root, "direction/language.md"));
    const context = await run(root, "context", "--host", "codex");
    expect(context).not.toContain("PRIVATE REVIEW MARKER");
    expect(context).toMatch(/language.*(unsafe|hard link|separate copy)/i);
    expect(await store.load()).toEqual(before);
  });
});
