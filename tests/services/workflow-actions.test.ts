import { afterEach, describe, expect, it } from "vitest";
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssetRecord, ProjectManifest, ReferenceRecord } from "../../src/domain/schema.js";
import { applyReviewDecision } from "../../src/services/artifacts.js";
import { initializeProject } from "../../src/services/initializer.js";
import {
  addProjectArtifact,
  addProjectReference,
  advanceProjectStage,
  checkProjectStage,
  reviseProjectArtifact,
  submitProjectArtifact
} from "../../src/services/workflow-actions.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const roots: string[] = [];
const reference: ReferenceRecord = {
  id: "archive", url: "https://example.com/archive", title: "Archive rhythm",
  relevance: "Supports the editorial hierarchy.", lesson: "Group metadata separately.",
  avoidCopying: "Do not reuse typography or imagery.", attribution: "Example Archive",
  licenseStatus: "not-applicable", licenseNotes: "Reference only; no material reused."
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<ProjectStore> {
  const root = await mkdtemp(join(tmpdir(), "creative-workflow-"));
  roots.push(root);
  await initializeProject({ root, id: "field-notes", name: "Field Notes", kind: "new-site" });
  await mkdir(join(root, "direction"));
  await mkdir(join(root, ".creative-preproduction/private/studies"), { recursive: true });
  await writeFile(join(root, "direction", "brief-v1.md"), "# Brief\nA public field-notes archive.");
  await writeFile(join(root, "direction", "brief-v2.md"), "# Brief\nA focused field-notes archive.");
  return new ProjectStore(root);
}

async function addBrief(store: ProjectStore): Promise<ProjectManifest> {
  return addProjectArtifact(store, {
    id: "brief", kind: "creative-brief", path: "direction/brief-v1.md", rationale: "Frame the audience."
  });
}

function asset(): AssetRecord {
  const now = "2026-09-30T18:00:00.000Z";
  return {
    id: "portrait", title: "Portrait", source: "Original commission", intendedRole: "Lead image",
    modificationPolicy: "adaptable", rightsStatus: "cleared", providerScopes: ["local-html-svg"],
    storage: { kind: "managed", path: "direction/portrait.svg" }, allowedTreatments: ["crop"],
    prohibitedTreatments: [], visualNotes: {}, responsiveGuidance: "Protect the subject.",
    accessibilityIntent: "Identify the artist.", relatedArtifactIds: [], relatedFeedbackIds: [],
    unresolvedQuestions: [], createdAt: now, updatedAt: now
  };
}

describe("explicit artifact workflow", () => {
  it("registers an existing file as a draft with no implicit review", async () => {
    const store = await project();
    const saved = await addBrief(store);
    expect(saved.artifacts).toEqual([expect.objectContaining({
      id: "brief", kind: "creative-brief", version: 1, path: "direction/brief-v1.md",
      status: "draft", visibility: "project", assetIds: []
    })]);
    expect(saved.approvals).toEqual([]);
    expect(await store.load()).toEqual(saved);
  });

  it("rejects duplicate identities without changing the manifest", async () => {
    const store = await project();
    const before = await addBrief(store);
    await expect(addBrief(store)).rejects.toThrow(/already exists/i);
    expect(await store.load()).toEqual(before);
  });

  it.each(["missing.md", "direction", "../outside.md", ".creative-preproduction/private/studies/private.md"])(
    "rejects unavailable or unsafe registration file %s", async (path) => {
      const store = await project();
      await writeFile(join(store.root, ".creative-preproduction/private/studies/private.md"), "Private notes");
      const before = await store.load();
      await expect(addProjectArtifact(store, { id: "brief", kind: "creative-brief", path, rationale: "Frame it." }))
        .rejects.toThrow();
      expect(await store.load()).toEqual(before);
    }
  );

  it("rejects a public alias of private study bytes", async () => {
    const store = await project();
    const source = join(store.root, ".creative-preproduction/private/studies/private.md");
    await writeFile(source, "Private notes");
    await symlink(source, join(store.root, "direction", "private-alias.md"));
    await expect(addProjectArtifact(store, {
      id: "brief", kind: "creative-brief", path: "direction/private-alias.md", rationale: "Frame it."
    })).rejects.toThrow();
    expect((await store.load()).artifacts).toEqual([]);
  });

  it("only accepts actual eligible assets on fresh project artifacts", async () => {
    const store = await project();
    await expect(addProjectArtifact(store, {
      id: "brief", kind: "creative-brief", path: "direction/brief-v1.md", rationale: "Frame it.", assetIds: ["missing"]
    })).rejects.toThrow(/missing asset/i);
    await store.mutate((manifest) => ({ ...manifest, assets: [asset()] }));
    await writeFile(join(store.root, "direction/portrait.svg"), "<svg/>\n");
    expect((await addProjectArtifact(store, {
      id: "brief", kind: "creative-brief", path: "direction/brief-v1.md", rationale: "Frame it.", assetIds: ["portrait"]
    })).artifacts[0]?.assetIds).toEqual(["portrait"]);
  });

  it("requires linked managed asset bytes before registration, revision, and submission", async () => {
    const store = await project();
    await store.mutate((manifest) => ({ ...manifest, assets: [asset()] }));
    const input = {
      id: "brief", kind: "creative-brief" as const, path: "direction/brief-v1.md", rationale: "Frame it.", assetIds: ["portrait"]
    };
    await expect(addProjectArtifact(store, input)).rejects.toThrow();
    expect((await store.load()).artifacts).toEqual([]);
    await writeFile(join(store.root, "direction/portrait.svg"), "<svg/>\n");
    await addProjectArtifact(store, input);
    await rm(join(store.root, "direction/portrait.svg"));
    const before = await store.load();
    await expect(reviseProjectArtifact(store, {
      id: "brief", version: 1, path: "direction/brief-v2.md", rationale: "Focus it."
    })).rejects.toThrow();
    await expect(submitProjectArtifact(store, { id: "brief", version: 1 })).rejects.toThrow();
    expect(await store.load()).toEqual(before);
  });

  it("preserves approved versions and review history when revising", async () => {
    const store = await project();
    await addBrief(store);
    await store.mutate((manifest) => applyReviewDecision(manifest, {
      artifactId: "brief", artifactVersion: 1, tier: "self", decision: "approved", reviewer: "Mina", reason: "Scope is clear."
    }));
    const approved = await store.load();
    const revised = await reviseProjectArtifact(store, {
      id: "brief", version: 1, path: "direction/brief-v2.md", rationale: "Clarify the opening focus."
    });
    expect(revised.artifacts[0]).toEqual(approved.artifacts[0]);
    expect(revised.approvals).toEqual(approved.approvals);
    expect(revised.artifacts[1]).toMatchObject({ version: 2, parentVersion: 1, status: "draft", path: "direction/brief-v2.md" });
  });

  it("requires the explicit latest revision and a file not used by any older version", async () => {
    const store = await project();
    await addBrief(store);
    await reviseProjectArtifact(store, { id: "brief", version: 1, path: "direction/brief-v2.md", rationale: "Clarify focus." });
    const before = await store.load();
    await expect(reviseProjectArtifact(store, {
      id: "brief", version: 1, path: "direction/brief-v3.md", rationale: "Further focus."
    })).rejects.toThrow(/latest.*2/i);
    await expect(reviseProjectArtifact(store, {
      id: "brief", version: 2, path: "direction/brief-v1.md", rationale: "Reuse old file."
    })).rejects.toThrow(/different|already.*used/i);
    await link(join(store.root, "direction/brief-v1.md"), join(store.root, "direction/brief-alias.md"));
    await expect(reviseProjectArtifact(store, {
      id: "brief", version: 2, path: "direction/brief-alias.md", rationale: "Reuse aliased old file."
    })).rejects.toThrow(/different|already.*used/i);
    expect(await store.load()).toEqual(before);
  });

  it("submits only the exact latest draft and records no approval", async () => {
    const store = await project();
    await addBrief(store);
    await reviseProjectArtifact(store, { id: "brief", version: 1, path: "direction/brief-v2.md", rationale: "Clarify focus." });
    await expect(submitProjectArtifact(store, { id: "brief", version: 1 })).rejects.toThrow(/latest.*2/i);
    const submitted = await submitProjectArtifact(store, { id: "brief", version: 2 });
    expect(submitted.artifacts.map(({ status }) => status)).toEqual(["draft", "in-review"]);
    expect(submitted.approvals).toEqual([]);
    await expect(submitProjectArtifact(store, { id: "brief", version: 2 })).rejects.toThrow(/draft/i);
  });

  it("does not submit a draft whose file disappeared", async () => {
    const store = await project();
    const before = await addBrief(store);
    await rm(join(store.root, "direction/brief-v1.md"));
    await expect(submitProjectArtifact(store, { id: "brief", version: 1 })).rejects.toThrow();
    expect(await store.load()).toEqual(before);
  });

  it("rejects a draft replaced by a hard link to a tracked private source before submission", async () => {
    const store = await project();
    await mkdir(join(store.root, ".creative-preproduction/private/assets/portrait"), { recursive: true });
    const privateSource = join(store.root, ".creative-preproduction/private/assets/portrait/source");
    await writeFile(privateSource, "Private portrait bytes");
    await store.mutate((manifest) => ({
      ...manifest, assets: [{ ...asset(), rightsStatus: "unknown", storage: { kind: "private", ref: "portrait" } }]
    }));
    const before = await addBrief(store);
    await rm(join(store.root, "direction/brief-v1.md"));
    await link(privateSource, join(store.root, "direction/brief-v1.md"));
    await expect(submitProjectArtifact(store, { id: "brief", version: 1 })).rejects.toThrow(/hard link|separate copy/i);
    expect(await store.load()).toEqual(before);
  });
});

describe("reference and stage workflow", () => {
  it("adds a complete reference and preserves a concurrent saved artifact", async () => {
    const store = await project();
    const stale = new ProjectStore(store.root);
    await stale.load();
    await addBrief(store);
    const saved = await addProjectReference(stale, reference);
    expect(saved.references).toEqual([reference]);
    expect(saved.artifacts.map(({ id }) => id)).toEqual(["brief"]);
    await expect(addProjectReference(store, reference)).rejects.toThrow(/already exists/i);
    await expect(addProjectReference(store, { ...reference, id: "bad", lesson: " " })).rejects.toThrow();
    expect((await store.load()).references).toEqual([reference]);
  });

  it("checks stage requirements without saving and advances only after an explicit review", async () => {
    const store = await project();
    const draft = await addBrief(store);
    expect(await checkProjectStage(store, "research")).toMatchObject({ allowed: false, reasons: [expect.stringMatching(/approved creative-brief/i)] });
    expect(await store.load()).toEqual(draft);
    await expect(advanceProjectStage(store, "research")).rejects.toThrow(/approved creative-brief/i);
    await store.mutate((manifest) => applyReviewDecision(manifest, {
      artifactId: "brief", artifactVersion: 1, tier: "self", decision: "approved", reviewer: "Mina", reason: "Scope is clear."
    }));
    expect(await checkProjectStage(store, "research")).toEqual({ allowed: true, reasons: [] });
    expect((await advanceProjectStage(store, "research")).stage).toBe("research");
  });

  it("blocks unsafe file integrity even when the required artifact is approved", async () => {
    const store = await project();
    await addBrief(store);
    await store.mutate((manifest) => applyReviewDecision(manifest, {
      artifactId: "brief", artifactVersion: 1, tier: "self", decision: "approved", reviewer: "Mina", reason: "Scope is clear."
    }));
    await rm(join(store.root, "direction/brief-v1.md"));
    expect(await checkProjectStage(store, "research")).toMatchObject({ allowed: false });
    await expect(advanceProjectStage(store, "research")).rejects.toThrow(/artifact-file-missing|does not exist/i);
    expect((await store.load()).stage).toBe("brief");
  });

  it("rejects same-stage, backward, and skipped transitions", async () => {
    const store = await project();
    await expect(advanceProjectStage(store, "brief")).rejects.toThrow(/adjacent|already/i);
    await expect(advanceProjectStage(store, "territories")).rejects.toThrow(/adjacent|skip/i);
    await store.mutate((manifest) => ({ ...manifest, stage: "research" }));
    await expect(advanceProjectStage(store, "brief")).rejects.toThrow(/adjacent|forward/i);
    expect((await store.load()).stage).toBe("research");
  });
});
