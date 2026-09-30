import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import type { LegacyProjectManifest } from "../../src/domain/schema.js";
import { migrateManifest } from "../../src/domain/migration.js";

const now = "2026-09-17T18:00:00.000Z";
const v1 = {
  schemaVersion: 1,
  harnessVersion: "0.1.0",
  project: { id: "museum-redesign", name: "Museum redesign", kind: "existing-site" },
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

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("migrateManifest", () => {
  it("converts a v1 manifest into the canonical v2 structure", () => {
    const migrated = migrateManifest(v1, "0.2.0", new Date(now));

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      harnessVersion: "0.2.0",
      participants: [],
      decisionOwners: [],
      assets: [],
      feedback: [],
      artifacts: v1.artifacts,
      approvals: v1.approvals,
      stage: v1.stage
    });
    expect(migrated.artifacts).toEqual([{
      ...v1.artifacts[0],
      visibility: "project",
      assetIds: []
    }]);
    expect(migrated.approvals).toEqual(v1.approvals);
  });

  it("migrates an inspected project through the explicit CLI command", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-migration-cli-"));
    temporaryRoots.push(root);
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "manifest.json"), `${JSON.stringify(v1, null, 2)}\n`, "utf8");
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    await createProgram().parseAsync(["node", "creative-preproduction", "migrate", "--root", root]);

    expect(output).toBe("Migrated Museum redesign to schema version 2\n");
    expect(JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8"))).toMatchObject({ schemaVersion: 2 });
  });
});
