import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import type { ArtifactRecord, ApprovalRecord, ProjectManifest } from "../../src/domain/schema.js";
import { canTransition, transitionProject } from "../../src/domain/workflow.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const timestamp = "2026-09-16T18:00:00.000Z";

const base = {
  schemaVersion: 2,
  harnessVersion: "0.1.0",
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
  createdAt: timestamp,
  updatedAt: timestamp
} satisfies ProjectManifest;

function artifact(
  id: string,
  kind: ArtifactRecord["kind"],
  status: ArtifactRecord["status"] = "approved",
  version = 1
): ArtifactRecord {
  return {
    id,
    kind,
    version,
    path: `${id}.md`,
    status,
    visibility: "project",
    assetIds: [],
    rationale: `Rationale for ${id}`,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function approval(
  artifactId: string,
  artifactVersion = 1,
  tier: ApprovalRecord["tier"] = "self",
  decision: ApprovalRecord["decision"] = "approved"
): ApprovalRecord {
  return {
    id: `${artifactId}-${artifactVersion}-${tier}`,
    artifactId,
    artifactVersion,
    tier,
    decision,
    reviewer: "Reviewer",
    reason: "Ready to proceed",
    createdAt: timestamp
  };
}

function withApprovedArtifact(
  manifest: ProjectManifest,
  id: string,
  kind: ArtifactRecord["kind"],
  tier: ApprovalRecord["tier"] = "self"
): ProjectManifest {
  return {
    ...manifest,
    artifacts: [...manifest.artifacts, artifact(id, kind)],
    approvals: [...manifest.approvals, approval(id, 1, tier)]
  };
}

describe("canTransition", () => {
  it.each(["provisional", "draft", "approved"] as const)(
    "does not count a private %s territory as stage-gate evidence", (status) => {
      const project: ProjectManifest = {
        ...base, stage: "territories",
        artifacts: [artifact("selected", "creative-territory"), {
          ...artifact("private-option", "creative-territory", status), visibility: "private",
          path: ".creative-preproduction/private/studies/option.md", question: "Try another direction?",
          assumptions: [], blockers: []
        }],
        approvals: [approval("selected"), approval("private-option")]
      };
      const before = structuredClone(project);
      expect(canTransition(project, "visual-language")).toEqual({
        allowed: false, reasons: ["At least two creative-territory artifacts are required."]
      });
      expect(project).toEqual(before);
    }
  );

  it("requires an approved creative brief before research", () => {
    expect(canTransition(base, "research")).toEqual({
      allowed: false,
      reasons: ["An approved creative-brief artifact is required."]
    });
  });

  it("allows an approved creative brief to unlock research", () => {
    expect(canTransition(withApprovedArtifact(base, "brief-1", "creative-brief"), "research"))
      .toEqual({ allowed: true, reasons: [] });
  });

  it("does not accept an approval for another or superseded artifact version", () => {
    const wrongVersion = {
      ...base,
      artifacts: [artifact("brief-1", "creative-brief", "approved", 2)],
      approvals: [approval("brief-1", 1)]
    } satisfies ProjectManifest;
    const superseded = {
      ...base,
      artifacts: [artifact("brief-1", "creative-brief", "superseded")],
      approvals: [approval("brief-1")]
    } satisfies ProjectManifest;

    expect(canTransition(wrongVersion, "research").allowed).toBe(false);
    expect(canTransition(superseded, "research").allowed).toBe(false);
  });

  it("requires approval of the latest artifact version", () => {
    const manifest = {
      ...base,
      artifacts: [
        artifact("brief-1", "creative-brief", "approved", 1),
        artifact("brief-1", "creative-brief", "draft", 2)
      ],
      approvals: [approval("brief-1", 1)]
    } satisfies ProjectManifest;

    expect(canTransition(manifest, "research")).toEqual({
      allowed: false,
      reasons: ["An approved creative-brief artifact is required."]
    });
  });

  it("does not treat two versions of one territory as two territories", () => {
    const manifest = {
      ...base,
      stage: "territories",
      artifacts: [
        artifact("territory-1", "creative-territory", "approved", 1),
        artifact("territory-1", "creative-territory", "approved", 2)
      ],
      approvals: [approval("territory-1", 2)]
    } satisfies ProjectManifest;

    expect(canTransition(manifest, "visual-language")).toEqual({
      allowed: false,
      reasons: ["At least two creative-territory artifacts are required."]
    });
  });

  it("does not accept conditional approval as final gate approval", () => {
    const manifest = {
      ...base,
      artifacts: [artifact("brief-1", "creative-brief")],
      approvals: [approval("brief-1", 1, "self", "approved-with-conditions")]
    } satisfies ProjectManifest;

    expect(canTransition(manifest, "research")).toEqual({
      allowed: false,
      reasons: ["An approved creative-brief artifact is required."]
    });
  });

  it("requires both an approved research board and a reference before territories", () => {
    const manifest = withApprovedArtifact({ ...base, stage: "research" }, "research-1", "research-board");

    expect(canTransition(manifest, "territories")).toEqual({
      allowed: false,
      reasons: ["At least one reference is required."]
    });
    expect(canTransition({ ...manifest, artifacts: [], approvals: [] }, "territories")).toEqual({
      allowed: false,
      reasons: [
        "An approved research-board artifact is required.",
        "At least one reference is required."
      ]
    });
  });

  it("requires two territories with at least one approved before visual language", () => {
    const manifest = withApprovedArtifact(
      { ...base, stage: "territories", artifacts: [artifact("territory-1", "creative-territory", "draft")] },
      "territory-2",
      "creative-territory"
    );

    expect(canTransition(manifest, "visual-language")).toEqual({ allowed: true, reasons: [] });
    expect(canTransition({ ...manifest, approvals: [] }, "visual-language")).toEqual({
      allowed: false,
      reasons: ["At least one creative-territory artifact must be approved."]
    });
  });

  it("requires an approved visual language before exploration", () => {
    expect(canTransition({ ...base, stage: "visual-language" }, "exploration")).toEqual({
      allowed: false,
      reasons: ["An approved visual-language artifact is required."]
    });
  });

  it("requires a composition study in review or approved before review", () => {
    const manifest = {
      ...base,
      stage: "exploration",
      artifacts: [artifact("study-1", "composition-study", "in-review")]
    } satisfies ProjectManifest;

    expect(canTransition(manifest, "review")).toEqual({ allowed: true, reasons: [] });
    expect(canTransition({ ...manifest, artifacts: [artifact("study-1", "composition-study", "draft")] }, "review"))
      .toEqual({
        allowed: false,
        reasons: ["A composition-study artifact in review or approved is required."]
      });
  });

  it("enforces the project-kind approval tier for handoff", () => {
    const newSite = withApprovedArtifact({ ...base, stage: "review" }, "handoff-1", "implementation-handoff", "peer");
    const existingSite = {
      ...newSite,
      project: { ...newSite.project, kind: "existing-site" }
    } satisfies ProjectManifest;

    expect(canTransition(newSite, "handoff")).toEqual({
      allowed: false,
      reasons: ["The approved implementation-handoff requires creative-lead or stakeholder approval."]
    });
    expect(canTransition(existingSite, "handoff")).toEqual({ allowed: true, reasons: [] });
    expect(canTransition({
      ...newSite,
      approvals: [approval("handoff-1", 1, "creative-lead")]
    }, "handoff")).toEqual({ allowed: true, reasons: [] });
  });

  it("appends decision-owner and open-feedback policy blockers before handoff", () => {
    const handoff = artifact("handoff-1", "implementation-handoff");
    const manifest = {
      ...base,
      stage: "review",
      participants: [
        { id: "mina-shah", name: "Mina Shah", role: "creative-lead" as const, createdAt: timestamp },
        { id: "alex-chen", name: "Alex Chen", role: "stakeholder" as const, createdAt: timestamp }
      ],
      decisionOwners: [{ area: "implementation-readiness" as const, participantId: "mina-shah" }],
      artifacts: [handoff],
      approvals: [{
        ...approval("handoff-1", 1, "stakeholder"),
        reviewer: "Alex Chen",
        reviewerId: "alex-chen"
      }],
      feedback: [{
        id: "condition-1",
        originalText: "Confirm the crop.",
        source: "Review notes",
        classifications: ["approval-condition" as const],
        interpretation: "The crop remains conditional.",
        resolutionStatus: "open" as const,
        resultingArtifactIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      }]
    } satisfies ProjectManifest;

    expect(canTransition(manifest, "handoff")).toEqual({
      allowed: false,
      reasons: [
        "Feedback condition-1 remains an open approval condition.",
        "Artifact handoff-1 v1 requires approval from implementation-readiness owner mina-shah."
      ]
    });
  });

  it("preserves tier-based handoff behavior when no decision owner is configured", () => {
    const manifest = withApprovedArtifact(
      { ...base, stage: "review" },
      "handoff-1",
      "implementation-handoff",
      "creative-lead"
    );

    expect(canTransition(manifest, "handoff")).toEqual({ allowed: true, reasons: [] });
  });

  it.each(["returned", "approved-with-conditions"] as const)(
    "blocks a historical approval after a later %s decision, regardless of manifest order",
    (decision) => {
      const manifest = withApprovedArtifact(base, "brief-1", "creative-brief");
      manifest.approvals.unshift({
        ...approval("brief-1", 1, "creative-lead", decision),
        createdAt: "2026-09-16T12:00:00-07:00"
      });

      expect(canTransition(manifest, "research").allowed).toBe(false);
    }
  );

  it("does not let a later self approval reuse a creative-lead approval before a return", () => {
    const manifest = withApprovedArtifact(
      { ...base, stage: "review" }, "handoff-1", "implementation-handoff", "creative-lead"
    );
    manifest.approvals.push(
      { ...approval("handoff-1", 1, "creative-lead", "returned"), createdAt: "2026-09-16T19:00:00Z" },
      { ...approval("handoff-1", 1, "self"), createdAt: "2026-09-16T20:00:00Z" }
    );

    expect(canTransition(manifest, "handoff")).toEqual({
      allowed: false,
      reasons: ["The approved implementation-handoff requires creative-lead or stakeholder approval."]
    });
  });

  it.each(["creative-lead", "stakeholder"] as const)(
    "allows a later %s approval to explicitly resolve a return and insufficient approval",
    (tier) => {
      const manifest = withApprovedArtifact(
        { ...base, stage: "review" }, "handoff-1", "implementation-handoff", "creative-lead"
      );
      manifest.approvals.push(
        { ...approval("handoff-1", 1, "creative-lead", "returned"), createdAt: "2026-09-16T19:00:00Z" },
        { ...approval("handoff-1", 1, "self"), createdAt: "2026-09-16T20:00:00Z" }
      );
      expect(canTransition(manifest, "handoff").allowed).toBe(false);

      // Chronology, not array position or timestamp text, selects the resolution.
      manifest.approvals.unshift({
        ...approval("handoff-1", 1, tier), createdAt: "2026-09-16T14:00:00-07:00"
      });

      expect(canTransition(manifest, "handoff")).toEqual({ allowed: true, reasons: [] });
    }
  );

  it("uses later manifest order to break equal approval timestamps", () => {
    const manifest = withApprovedArtifact(base, "brief-1", "creative-brief");
    manifest.approvals.push(approval("brief-1", 1, "creative-lead", "returned"));
    expect(canTransition(manifest, "research").allowed).toBe(false);

    manifest.approvals.push(approval("brief-1", 1, "creative-lead"));
    expect(canTransition(manifest, "research").allowed).toBe(true);
  });

  it("ignores later approval decisions for another artifact ID or version", () => {
    const manifest = withApprovedArtifact(base, "brief-1", "creative-brief");
    manifest.approvals.push(
      { ...approval("other-brief", 1, "creative-lead", "returned"), createdAt: "2026-09-16T19:00:00Z" },
      { ...approval("brief-1", 2, "creative-lead", "returned"), createdAt: "2026-09-16T20:00:00Z" }
    );

    expect(canTransition(manifest, "research").allowed).toBe(true);
  });

  it("allows returning to an earlier stage without destroying history", () => {
    expect(canTransition({ ...base, stage: "visual-language" }, "research"))
      .toEqual({ allowed: true, reasons: [] });
  });

  it("rejects skipped and same-stage transitions", () => {
    expect(canTransition(base, "territories")).toEqual({
      allowed: false,
      reasons: ["Cannot skip forward from brief to territories."]
    });
    expect(canTransition(base, "brief")).toEqual({
      allowed: false,
      reasons: ["Project is already at stage brief."]
    });
  });
});

describe("ProjectStore and transitionProject", () => {
  it("validates persisted manifests and updates stage atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-workflow-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    const ready = withApprovedArtifact(base, "brief-1", "creative-brief");
    await writeFile(join(workspace, "manifest.json"), `${JSON.stringify(ready, null, 2)}\n`, "utf8");
    const store = new ProjectStore(root);

    const transitioned = await transitionProject(store, "research", new Date("2026-09-16T19:00:00Z"));

    expect(transitioned.stage).toBe("research");
    expect(transitioned.updatedAt).toBe("2026-09-16T19:00:00.000Z");
    expect(JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8"))).toEqual(transitioned);
    await expect(readFile(join(workspace, "manifest.json.tmp"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not persist an illegal transition", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-workflow-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "manifest.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
    const store = new ProjectStore(root);

    await expect(transitionProject(store, "research"))
      .rejects.toThrow("Cannot transition from brief to research: An approved creative-brief artifact is required.");
    expect(JSON.parse(await readFile(join(workspace, "manifest.json"), "utf8"))).toEqual(base);
  });

  it("rejects an invalid manifest before saving it", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-workflow-"));
    const store = new ProjectStore(root);

    await expect(store.save({ ...base, stage: "invalid" } as unknown as ProjectManifest)).rejects.toThrow();
  });
});

describe("status command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints project facts and unmet reasons without a score", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-status-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "manifest.json"), JSON.stringify({
      ...base,
      unresolvedQuestions: ["Who owns final copy?"]
    }), "utf8");
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    await createProgram().parseAsync(["node", "creative-preproduction", "status", "--root", root]);

    expect(output).toContain("Project: Museum");
    expect(output).toContain("Kind: new-site");
    expect(output).toContain("Current stage: brief");
    expect(output).toContain("Artifacts: 0");
    expect(output).toContain("Unresolved questions: 1");
    expect(output).toContain("Who owns final copy?");
    expect(output).toContain("An approved creative-brief artifact is required.");
    expect(output.toLowerCase()).not.toMatch(/score|percentage|grade/);
  });

  it("reports terminal handoff without looking for another stage", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-status-"));
    const workspace = join(root, ".creative-preproduction");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "manifest.json"), JSON.stringify({ ...base, stage: "handoff" }), "utf8");
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    await createProgram().parseAsync(["node", "creative-preproduction", "status", "--root", root]);

    expect(output).toContain("Handoff reached; no forward transition remains.");
  });
});
