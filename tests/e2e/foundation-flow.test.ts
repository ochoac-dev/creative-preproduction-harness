import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { transitionProject } from "../../src/domain/workflow.js";
import { createArtifact, recordApproval, reviseArtifact } from "../../src/services/artifacts.js";
import { initializeProject } from "../../src/services/initializer.js";
import { validateProject } from "../../src/services/validation.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("foundation workflow", () => {
  it("persists an approved brief through transition and keeps revisions immutable", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-e2e-"));
    temporaryRoots.push(root);
    const workspace = join(root, ".creative-preproduction");
    const artifactsDirectory = join(workspace, "artifacts");
    const versionOneRelativePath = ".creative-preproduction/artifacts/creative-brief-v1.md";
    const versionTwoRelativePath = ".creative-preproduction/artifacts/creative-brief-v2.md";

    const manifest = await initializeProject({
      root,
      id: "civic-arts-refresh",
      name: "Civic Arts Refresh",
      kind: "existing-site",
      now: new Date("2026-09-16T18:00:00Z")
    });

    expect(manifest).toMatchObject({
      schemaVersion: 2,
      participants: [],
      decisionOwners: [],
      assets: [],
      feedback: []
    });

    expect(await readFile(join(workspace, "existing-site-audit.md"), "utf8"))
      .toContain("Preserved strengths");

    await mkdir(artifactsDirectory, { recursive: true });
    await writeFile(
      join(artifactsDirectory, "creative-brief-v1.md"),
      "# Creative brief\n\nRefresh the civic arts site without losing its local identity.\n",
      "utf8"
    );

    const store = new ProjectStore(root);
    const initialized = await store.load();
    const draftBrief = createArtifact({
      id: "creative-brief",
      kind: "creative-brief",
      path: versionOneRelativePath,
      rationale: "Defines the shared intent before research begins.",
      now: new Date("2026-09-16T18:10:00Z")
    });
    const approval = recordApproval({
      artifact: draftBrief,
      tier: "peer",
      decision: "approved",
      reviewer: "Morgan Lee",
      reason: "The audience, constraints, and intended outcome are clear enough to begin research.",
      now: new Date("2026-09-16T18:20:00Z")
    });

    await store.save({
      ...initialized,
      artifacts: [approval.artifact],
      approvals: [approval.approval],
      updatedAt: "2026-09-16T18:20:00.000Z"
    });

    await transitionProject(store, "research", new Date("2026-09-16T18:30:00Z"));

    const reloadedAtResearch = await store.load();
    expect(reloadedAtResearch.stage).toBe("research");
    expect(reloadedAtResearch.artifacts).toEqual([approval.artifact]);
    expect(reloadedAtResearch.approvals).toEqual([approval.approval]);
    expect((await validateProject(root, reloadedAtResearch)).filter(({ severity }) => severity === "error"))
      .toEqual([]);

    await transitionProject(store, "brief", new Date("2026-09-16T18:40:00Z"));
    const reloadedAtBrief = await store.load();
    expect(reloadedAtBrief.artifacts).toEqual([approval.artifact]);
    expect(reloadedAtBrief.approvals).toEqual([approval.approval]);
    await transitionProject(store, "research", new Date("2026-09-16T18:50:00Z"));

    await writeFile(
      join(artifactsDirectory, "creative-brief-v2.md"),
      "# Creative brief\n\nRefresh the civic arts site while preserving local identity and volunteer trust.\n",
      "utf8"
    );
    const revisedBrief = reviseArtifact(approval.artifact, {
      path: versionTwoRelativePath,
      rationale: "Adds volunteer trust as an explicit constraint discovered during research.",
      now: new Date("2026-09-16T19:00:00Z")
    });
    const beforeRevision = await store.load();
    await store.save({
      ...beforeRevision,
      artifacts: [...beforeRevision.artifacts, revisedBrief],
      updatedAt: "2026-09-16T19:00:00.000Z"
    });

    const finalManifest = await store.load();
    expect(finalManifest.stage).toBe("research");
    expect(finalManifest.artifacts).toEqual([approval.artifact, revisedBrief]);
    expect(finalManifest.approvals).toEqual([approval.approval]);
    expect(finalManifest.artifacts.map(({ version, status, parentVersion }) => ({
      version,
      status,
      parentVersion
    }))).toEqual([
      { version: 1, status: "approved", parentVersion: undefined },
      { version: 2, status: "draft", parentVersion: 1 }
    ]);
  });
});
