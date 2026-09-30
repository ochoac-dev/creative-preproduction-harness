import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeAdapter } from "../../src/adapters/claude.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { createProgram } from "../../src/cli.js";
import type { ProjectManifest } from "../../src/domain/schema.js";

const roots: string[] = [];
const now = "2026-09-17T18:00:00.000Z";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifest(): ProjectManifest {
  const project: ProjectManifest = {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "civic-arts", name: "Civic Arts", kind: "new-site" },
    stage: "visual-language",
    participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: now }],
    decisionOwners: [{ area: "creative-direction", participantId: "mina-shah" }],
    artifacts: [
      {
        id: "identity-thesis", kind: "identity-thesis", version: 1,
        path: "direction/identity-thesis-v1.md", status: "approved", visibility: "project", assetIds: [],
        rationale: "Establishes the active identity.", createdAt: now, updatedAt: now
      },
      {
        id: "identity-thesis", kind: "identity-thesis", version: 2,
        path: "direction/identity-thesis-v2.md", status: "approved", visibility: "project", assetIds: [],
        rationale: "Refines the active identity.", parentVersion: 1, createdAt: now, updatedAt: now
      },
      {
        id: "neighborhood-territory", kind: "creative-territory", version: 1,
        path: "direction/neighborhood-territory.md", status: "approved", visibility: "project", assetIds: [],
        rationale: "Selects the neighborhood territory.", createdAt: now, updatedAt: now
      },
      {
        id: "visual-language", kind: "visual-language", version: 1,
        path: "direction/visual-language.md", status: "approved", visibility: "project", assetIds: [],
        rationale: "Selects the visual language.", createdAt: now, updatedAt: now
      },
      {
        id: "implementation-handoff", kind: "implementation-handoff", version: 1,
        path: ".creative-preproduction/private/studies/handoff-v1.md", status: "provisional", visibility: "private",
        assetIds: [], question: "Is the direction ready for implementation?", assumptions: ["The identity remains active."],
        blockers: ["Needs an explicit review."], rationale: "Private exploration only.", createdAt: now, updatedAt: now
      }
    ],
    approvals: [],
    assets: [{
      id: "campaign-portrait", title: "Campaign portrait", source: "Client handoff", intendedRole: "Home-page lead",
      modificationPolicy: "adaptable", rightsStatus: "unknown", providerScopes: ["local-html-svg"],
      storage: { kind: "private", ref: "campaign-portrait" }, allowedTreatments: ["responsive crop"],
      prohibitedTreatments: ["generative extension"], visualNotes: { focalPoint: "Face in right third" },
      responsiveGuidance: "Keep the face visible on small screens.", accessibilityIntent: "Identifies the featured artist.",
      relatedArtifactIds: [], relatedFeedbackIds: [], unresolvedQuestions: ["May the mobile crop move the subject?"],
      createdAt: now, updatedAt: now
    }],
    feedback: [{
      id: "opening-crop", originalText: "Keep the left field open.", source: "Workshop notes",
      classifications: ["question", "approval-condition"], interpretation: "Preserve the open left field around the portrait.",
      resolutionStatus: "open", resultingArtifactIds: [], createdAt: now, updatedAt: now
    }],
    references: [],
    unresolvedQuestions: ["What should visitors understand first?"],
    createdAt: now,
    updatedAt: now
  };
  project.approvals = project.artifacts.filter((artifact) => artifact.status === "approved").map((artifact) => ({
    id: `${artifact.id}-v${artifact.version}-approval`, artifactId: artifact.id, artifactVersion: artifact.version,
    decision: "approved", tier: "creative-lead", reviewer: "Mina Shah", reviewerId: "mina-shah",
    reason: "Explicit approval.", createdAt: now
  }));
  return project;
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "creative-context-adapter-"));
  roots.push(root);
  await mkdir(join(root, "direction"), { recursive: true });
  await writeFile(join(root, "direction", "identity-thesis-v1.md"), "Retired identity thesis.", "utf8");
  await writeFile(join(root, "direction", "identity-thesis-v2.md"), "The active identity thesis is a civic stage for local voices.", "utf8");
  await writeFile(join(root, "direction", "neighborhood-territory.md"), "The selected territory is a generous neighborhood noticeboard.", "utf8");
  await writeFile(join(root, "direction", "visual-language.md"), "The visual language uses direct typography and patient spacing.", "utf8");
  return root;
}

function withLatestIdentityPath(
  project: ProjectManifest,
  path: string,
  visibility: "private" | "project" = "project"
): ProjectManifest {
  return {
    ...project,
    artifacts: project.artifacts.map((artifact) => artifact.id === "identity-thesis" && artifact.version === 2
      ? { ...artifact, path, visibility }
      : artifact)
  };
}

function unknownRightsAsset(id: string, title: string) {
  return {
    id,
    title,
    source: "Client handoff",
    intendedRole: "Reference only",
    modificationPolicy: "adaptable" as const,
    rightsStatus: "unknown" as const,
    providerScopes: ["local-html-svg" as const],
    storage: { kind: "private" as const, ref: id },
    allowedTreatments: [],
    prohibitedTreatments: [],
    visualNotes: {},
    responsiveGuidance: "Do not expose outside private studies.",
    accessibilityIntent: "Do not publish without rights clearance.",
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: [],
    createdAt: now,
    updatedAt: now
  };
}

async function runCli(...arguments_: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  await createProgram().parseAsync(["node", "creative-preproduction", ...arguments_]);
  vi.restoreAllMocks();
  return output.join("");
}

describe("agent adapter conformance", () => {
  it.each(["returned", "approved-with-conditions"] as const)(
    "withholds %s exact-version guidance in both hosts without rewriting history", async (decision) => {
      const root = await fixtureRoot();
      const project = manifest();
      project.approvals.push({ ...project.approvals[1]!, id: "later-review", decision,
        reason: "Resolve the image treatment first.", createdAt: "2026-09-18T18:00:00.000Z" });
      const before = structuredClone(project);
      for (const adapter of [codexAdapter, claudeAdapter]) {
        const context = await adapter.build({ root, manifest: project });
        expect(context.approvedContext.join("\n")).not.toContain("The active identity thesis");
        expect(context.blockers.join("\n")).toContain(decision);
        expect(context.blockers.join("\n")).toContain("Resolve the image treatment first.");
      }
      expect(project).toEqual(before);
      expect(project.artifacts[1]?.status).toBe("approved");
    }
  );

  it("uses review instants and manifest order for ties, requiring an exact-version approval", async () => {
    const root = await fixtureRoot();
    const project = manifest();
    const approved = project.approvals[1]!;
    project.approvals.push({ ...approved, id: "tie-returned", decision: "returned",
      reason: "Withdraw at the same instant.", createdAt: "2026-09-17T11:00:00-07:00" });
    project.approvals.push({ ...approved, id: "older-approved", createdAt: "2026-09-17T17:59:00Z" });
    for (const adapter of [codexAdapter, claudeAdapter]) {
      expect((await adapter.build({ root, manifest: project })).approvedContext.join("\n"))
        .not.toContain("The active identity thesis");
      const reapproved = { ...project, approvals: [...project.approvals, { ...approved, id: "reapproved" }] };
      expect((await adapter.build({ root, manifest: reapproved })).approvedContext.join("\n"))
        .toContain("The active identity thesis");
      const wrongVersion = { ...project, approvals: project.approvals.filter((review) => review.artifactVersion !== 2) };
      expect((await adapter.build({ root, manifest: wrongVersion })).approvedContext.join("\n"))
        .not.toContain("The active identity thesis");
    }
  });

  it("keeps creative-direction facts equivalent while naming each host", async () => {
    const root = await fixtureRoot();
    const project = manifest();
    const codexContext = await codexAdapter.build({ root, manifest: project });
    const claudeContext = await claudeAdapter.build({ root, manifest: project });
    const codex = codexAdapter.render(codexContext);
    const claude = claudeAdapter.render(claudeContext);

    expect({ ...codexContext, host: "neutral" }).toEqual({ ...claudeContext, host: "neutral" });
    for (const context of [codex, claude]) {
      expect(context).toContain("partner, expansion");
      expect(context).toContain("The active identity thesis is a civic stage for local voices.");
      expect(context).toContain("Provider scopes:** local-html-svg");
      expect(context).toContain("Keep the left field open.");
      expect(context).toContain("Interpretation: Preserve the open left field around the portrait.");
      expect(context).toContain("project: What should visitors understand first?");
      expect(context).toContain("asset:campaign-portrait: May the mobile crop move the subject?");
      expect(context).toContain("feedback:opening-crop: Keep the left field open.");
      expect(context).toMatch(/private/i);
      expect(context).toMatch(/provisional/i);
      expect(context).toMatch(/only an explicit .*review.* creates approval/i);
      expect(context).toMatch(/coach/i);
      expect(context).toMatch(/collaborator/i);
      expect(context).toMatch(/maker/i);
      expect(context).toContain("Ask the next unresolved project question: What should visitors understand first?");
      expect(context).not.toMatch(/\b(score|grade|rating|percent)\b/i);
      expect(context.indexOf("Creative Preproduction Context")).toBeLessThan(context.indexOf("Current Posture"));
      expect(context.indexOf("Current Posture")).toBeLessThan(context.indexOf("Operating Rules"));
      expect(context.indexOf("Operating Rules")).toBeLessThan(context.indexOf("Approved Context"));
      expect(context.indexOf("Approved Context")).toBeLessThan(context.indexOf("Supplied Assets and Permissions"));
      expect(context.indexOf("Supplied Assets and Permissions")).toBeLessThan(context.indexOf("Imported Feedback"));
      expect(context.indexOf("Imported Feedback")).toBeLessThan(context.indexOf("Unresolved Questions"));
      expect(context.indexOf("Unresolved Questions")).toBeLessThan(context.indexOf("Blocking Conditions"));
      expect(context.indexOf("Blocking Conditions")).toBeLessThan(context.indexOf("Next Creative Action"));
    }
    expect(codex).toContain("Codex");
    expect(claude).toContain("Claude");
    expect(codexAdapter.render(await codexAdapter.build({ root, manifest: project }))).toBe(codex);
  });

  it("turns missing and escaping approved artifact paths into blockers", async () => {
    const root = await fixtureRoot();
    const project = manifest();
    const escaped = {
      ...project,
      artifacts: project.artifacts.map((artifact) => artifact.id === "identity-thesis" && artifact.version === 2
        ? { ...artifact, path: "../outside.md" }
        : artifact)
    };

    const context = await codexAdapter.build({ root, manifest: escaped });

    expect(context.approvedContext.join("\n")).not.toContain("The active identity thesis is a civic stage for local voices.");
    expect(context.blockers.join("\n")).toMatch(/identity-thesis.*inside the project root/i);
  });

  it.each([
    ["private visibility", "direction/identity-thesis-v2.md", "private" as const],
    ["private workspace path", ".creative-preproduction/private/identity-thesis.md", "project" as const]
  ])("blocks an approved identity thesis with %s without leaking content", async (_case, path, visibility) => {
    const root = await fixtureRoot();
    const privateContents = "Do not reveal this private identity thesis.";
    if (visibility === "project") {
      await mkdir(join(root, ".creative-preproduction", "private"), { recursive: true });
      await writeFile(join(root, ".creative-preproduction", "private", "identity-thesis.md"), privateContents, "utf8");
    }
    const project = withLatestIdentityPath(manifest(), path, visibility);
    const contexts = await Promise.all([codexAdapter, claudeAdapter].map((adapter) =>
      adapter.build({ root, manifest: project })
    ));

    for (const context of contexts) {
      expect(context.approvedContext.join("\n")).not.toContain(privateContents);
      expect(context.approvedContext.join("\n")).not.toContain("The active identity thesis is a civic stage for local voices.");
      expect(context.blockers.join("\n")).toMatch(/identity-thesis.*private/i);
    }
    expect({ ...contexts[0]!, host: "neutral" }).toEqual({ ...contexts[1]!, host: "neutral" });
  });

  it("blocks a linked approved artifact path that canonically escapes the project", async () => {
    const root = await fixtureRoot();
    const outside = await mkdtemp(join(tmpdir(), "creative-context-outside-"));
    roots.push(outside);
    const secret = "Do not reveal linked identity content.";
    await writeFile(join(outside, "identity.md"), secret, "utf8");
    await symlink(outside, join(root, "direction", "linked"), process.platform === "win32" ? "junction" : "dir");
    const project = withLatestIdentityPath(manifest(), "direction/linked/identity.md");

    const context = await codexAdapter.build({ root, manifest: project });

    expect(context.approvedContext.join("\n")).not.toContain(secret);
    expect(context.blockers.join("\n")).toMatch(/identity-thesis.*canonical.*project root/i);
  });

  it("blocks a project-visible artifact linked into the canonical private workspace", async () => {
    const root = await fixtureRoot();
    const privateRoot = join(root, ".creative-preproduction", "private");
    const secret = "Do not reveal linked private identity content.";
    await mkdir(privateRoot, { recursive: true });
    await writeFile(join(privateRoot, "identity.md"), secret, "utf8");
    await symlink(privateRoot, join(root, "direction", "linked-private"), process.platform === "win32" ? "junction" : "dir");
    const project = withLatestIdentityPath(manifest(), "direction/linked-private/identity.md");

    const context = await codexAdapter.build({ root, manifest: project });

    expect(context.approvedContext.join("\n")).not.toContain(secret);
    expect(context.blockers.join("\n")).toMatch(/identity-thesis.*private workspace/i);
  });

  it.skipIf(process.platform !== "win32")(
    "blocks a Windows case alias for the private workspace",
    async () => {
      const root = await fixtureRoot();
      const privateRoot = join(root, ".creative-preproduction", "private");
      const secret = "Do not reveal case-aliased private identity content.";
      await mkdir(privateRoot, { recursive: true });
      await writeFile(join(privateRoot, "identity.md"), secret, "utf8");
      const project = withLatestIdentityPath(manifest(), ".creative-preproduction/PRIVATE/identity.md");

      const context = await codexAdapter.build({ root, manifest: project });

      expect(context.approvedContext.join("\n")).not.toContain(secret);
      expect(context.blockers.join("\n")).toMatch(/identity-thesis.*private workspace/i);
    }
  );

  it("renders the complete unknown-rights restriction for every affected asset in both hosts", async () => {
    const root = await fixtureRoot();
    const project = manifest();
    const unreferenced = unknownRightsAsset("unreferenced-reference", "Unreferenced reference");
    const withUnknownAssets = { ...project, assets: [project.assets[0]!, unreferenced] };
    const contexts = await Promise.all([codexAdapter, claudeAdapter].map((adapter) =>
      adapter.build({ root, manifest: withUnknownAssets })
    ));

    for (const context of contexts) {
      const rendered = [codexAdapter, claudeAdapter].find((adapter) => adapter.host === context.host)!.render(context);
      expect(rendered).toContain(
        "Asset campaign-portrait (Campaign portrait) has unknown rights: limited to private local HTML/SVG exploration; cannot be sent to cloud providers, promoted, handed off, or published."
      );
      expect(rendered).toContain(
        "Asset unreferenced-reference (Unreferenced reference) has unknown rights: limited to private local HTML/SVG exploration; cannot be sent to cloud providers, promoted, handed off, or published."
      );
    }
    expect({ ...contexts[0]!, host: "neutral" }).toEqual({ ...contexts[1]!, host: "neutral" });
  });

  it("orders equally current approved artifacts and imported feedback by Unicode code point", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "direction", "a-territory.md"), "A territory.", "utf8");
    await writeFile(join(root, "direction", "z-territory.md"), "Z territory.", "utf8");
    const project = manifest();
    const ordered = {
      ...project,
      artifacts: project.artifacts.filter((artifact) => artifact.kind !== "creative-territory").concat([
        {
          id: "z-territory", kind: "creative-territory" as const, version: 1,
          path: "direction/z-territory.md", status: "approved" as const, visibility: "project" as const, assetIds: [],
          rationale: "Z territory.", createdAt: now, updatedAt: now
        },
        {
          id: "a-territory", kind: "creative-territory" as const, version: 1,
          path: "direction/a-territory.md", status: "approved" as const, visibility: "project" as const, assetIds: [],
          rationale: "A territory.", createdAt: now, updatedAt: now
        }
      ]),
      feedback: [
        { ...project.feedback[0]!, id: "z-feedback", originalText: "Z feedback." },
        { ...project.feedback[0]!, id: "a-feedback", originalText: "A feedback." }
      ]
    };
    ordered.approvals = [...ordered.approvals, ...["a-territory", "z-territory"].map((id) => ({
      ...project.approvals[2]!, id: `${id}-approval`, artifactId: id
    }))];

    const context = await codexAdapter.build({ root, manifest: ordered });

    expect(context.approvedContext.join("\n")).toContain("A territory.");
    expect(context.approvedContext.join("\n")).not.toContain("Z territory.");
    expect(context.feedback.map((feedback) => feedback.original)).toEqual(["A feedback.", "Z feedback."]);
  });

  it("renders a migrated project context without changing its manifest", async () => {
    const root = await fixtureRoot();
    const project = manifest();
    await mkdir(join(root, ".creative-preproduction"), { recursive: true });
    await writeFile(join(root, ".creative-preproduction", "manifest.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const output = await runCli("context", "--host", "codex", "--root", root);

    expect(output).toContain("Creative Preproduction Context (Codex)");
    expect(output).toContain("The active identity thesis is a civic stage for local voices.");
    expect(JSON.parse(await (await import("node:fs/promises")).readFile(
      join(root, ".creative-preproduction", "manifest.json"), "utf8"
    ))).toEqual(project);
  });
});
