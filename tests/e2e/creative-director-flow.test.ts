import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeAdapter } from "../../src/adapters/claude.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { createProgram } from "../../src/cli.js";
import { buildQuestionPacket } from "../../src/creative-direction/questions.js";
import { canUseAssetWithProvider, evaluateHandoffPolicy } from "../../src/domain/policy.js";
import { transitionProject } from "../../src/domain/workflow.js";
import { createArtifact, recordApproval } from "../../src/services/artifacts.js";
import { updateAsset } from "../../src/services/assets.js";
import { validateProject } from "../../src/services/validation.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { findHarnessPackage } from "../../src/services/package-info.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function runCli(...arguments_: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  await createProgram().parseAsync(["node", "creative-preproduction", ...arguments_]);
  return output.join("");
}

async function writeArtifact(root: string, path: string, contents: string): Promise<void> {
  const destination = join(root, path);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

async function addApprovedArtifact(
  store: ProjectStore,
  input: { id: string; kind: "creative-brief" | "research-board" | "creative-territory" | "visual-language" | "implementation-handoff"; path: string; contents: string; rationale: string; assetIds?: string[] }
): Promise<void> {
  await writeArtifact(store.root, input.path, input.contents);
  const artifact = {
    ...createArtifact({
      id: input.id,
      kind: input.kind,
      path: input.path,
      rationale: input.rationale
    }),
    assetIds: input.assetIds ?? []
  };
  const approved = recordApproval({
    artifact,
    tier: "creative-lead",
    decision: "approved",
    reviewer: "Mina Shah",
    reviewerId: "mina-shah",
    reason: "Mina explicitly approves this recorded version."
  });
  const manifest = await store.load();
  await store.save({
    ...manifest,
    artifacts: [...manifest.artifacts, approved.artifact],
    approvals: [...manifest.approvals, approved.approval]
  });
}

describe("creative-director collaboration flow", () => {
  it("preserves a private supplied-image exploration until an explicitly approved handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-director-flow-"));
    roots.push(root);
    const suppliedImage = join(root, "client-portrait-original.jpg");
    const feedbackFile = join(root, "ordinary-message.txt");
    const originalFeedback = "  Please keep the left side quiet.\nCould the portrait lead on mobile?  ";
    await writeFile(suppliedImage, Buffer.from([0xff, 0xd8, 0xff]));
    await writeFile(feedbackFile, originalFeedback, "utf8");

    await expect(runCli(
      "init", "--root", root, "--id", "river-voices", "--name", "River Voices", "--kind", "new-site"
    )).resolves.toBe("Initialized River Voices at stage brief\n");
    const store = new ProjectStore(root);
    expect((await store.load()).harnessVersion).toBe((await findHarnessPackage()).version);

    await runCli("participant", "add", "--root", root, "--id", "mina-shah", "--name", "Mina Shah", "--role", "creative-lead");
    await runCli("participant", "own", "--root", root, "--area", "creative-direction", "--participant", "mina-shah");
    await runCli(
      "asset", "add", "--root", root,
      "--id", "campaign-portrait", "--title", "Campaign portrait", "--source", "Client handoff",
      "--role", "Home-page lead", "--modification", "adaptable", "--rights", "unknown",
      "--path", suppliedImage, "--provider", "local-html-svg", "--allow", "responsive crop",
      "--prohibit", "generative extension", "--responsive", "Keep the face visible on small screens.",
      "--accessibility", "Identifies the featured artist."
    );
    await runCli(
      "feedback", "import", "--root", root, "--id", "portrait-message", "--file", feedbackFile,
      "--source", "Ordinary teammate message", "--class", "question", "--class", "approval-condition",
      "--interpretation", "Preserve the left field and confirm the mobile crop.",
      "--target-kind", "asset", "--target-id", "campaign-portrait", "--author", "Mina Shah"
    );

    const withQuestions = await store.load();
    await store.save(updateAsset(withQuestions, "campaign-portrait", {
      unresolvedQuestions: ["Which crop keeps the portrait specific on narrow screens?"]
    }));
    expect((await store.load()).feedback[0]?.originalText).toBe(originalFeedback);
    expect(buildQuestionPacket(await store.load()).items.map((item) => item.source)).toEqual([
      "asset:campaign-portrait", "feedback:portrait-message"
    ]);

    await runCli(
      "explore-private", "--root", root, "--id", "portrait-study", "--title", "Portrait study",
      "--question", "Can the supplied portrait lead without filling its negative space?",
      "--rationale", "Test the editorial composition privately before rights are cleared.",
      "--asset", "campaign-portrait", "--assumption", "The image stays local.",
      "--note", "Leave the left field quiet."
    );
    const provisional = (await store.load()).artifacts.find((artifact) => artifact.id === "portrait-study" && artifact.version === 1)!;
    expect(provisional.status).toBe("provisional");
    expect(provisional.visibility).toBe("private");
    expect(await readFile(join(root, provisional.path), "utf8")).toContain("PRIVATE PROVISIONAL STUDY");

    const blockedManifest = await store.load();
    const unknownAsset = blockedManifest.assets[0]!;
    expect(canUseAssetWithProvider(unknownAsset, "figma")).toEqual({ allowed: false, reasons: [
      "Asset campaign-portrait has unknown rights and is limited to private local HTML/SVG studies."
    ] });
    await writeArtifact(root, ".creative-preproduction/artifacts/portrait-study-v2.html", "<main>Reviewable study</main>");
    await expect(runCli(
      "promote", "--root", root, "--artifact", "portrait-study", "--version", "1",
      "--path", ".creative-preproduction/artifacts/portrait-study-v2.html", "--rationale", "Review after clearance."
    )).rejects.toThrow(/unknown rights/i);
    await expect(runCli(
      "review", "--root", root, "--artifact", "portrait-study", "--version", "1", "--tier", "creative-lead",
      "--decision", "approved", "--reviewer", "Mina Shah", "--reviewer-id", "mina-shah", "--reason", "Looks good"
    )).rejects.toThrow(/provisional artifacts cannot be approved/i);
    await writeArtifact(root, ".creative-preproduction/artifacts/unsafe-handoff.md", "# Blocked handoff\n");
    const blockedHandoff = recordApproval({
      artifact: { ...createArtifact({
        id: "unsafe-handoff", kind: "implementation-handoff", path: ".creative-preproduction/artifacts/unsafe-handoff.md",
        rationale: "A deliberately blocked handoff."
      }), assetIds: ["campaign-portrait"] },
      tier: "creative-lead", decision: "approved", reviewer: "Mina Shah", reviewerId: "mina-shah", reason: "Not releasable yet."
    });
    const blockedHandoffManifest = {
      ...blockedManifest,
      artifacts: [...blockedManifest.artifacts, blockedHandoff.artifact],
      approvals: [...blockedManifest.approvals, blockedHandoff.approval]
    };
    expect(evaluateHandoffPolicy(blockedHandoffManifest)).toEqual({
      allowed: false,
      reasons: expect.arrayContaining([
        "Asset campaign-portrait has unknown rights and cannot enter implementation handoff unsafe-handoff.",
        "Feedback portrait-message remains an open approval condition."
      ])
    });
    expect((await validateProject(root, blockedHandoffManifest))
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `${diagnostic.code}:${diagnostic.subjectId}`))
      .toEqual([
        "asset-private-reference:campaign-portrait",
        "asset-rights-blocked:campaign-portrait",
        "asset-rights-blocked:campaign-portrait",
        "feedback-condition-open:portrait-message"
      ]);

    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(join(root, "public", "campaign-portrait.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    await runCli(
      "asset", "update", "--root", root, "--id", "campaign-portrait", "--rights", "cleared",
      "--path", "public/campaign-portrait.jpg", "--provider", "local-html-svg", "--provider", "figma"
    );
    const clearedBeforeResolution = await store.load();
    expect(canUseAssetWithProvider(clearedBeforeResolution.assets[0]!, "figma")).toEqual({ allowed: true, reasons: [] });
    expect(evaluateHandoffPolicy({
      ...clearedBeforeResolution,
      artifacts: [...clearedBeforeResolution.artifacts, blockedHandoff.artifact],
      approvals: [...clearedBeforeResolution.approvals, blockedHandoff.approval]
    })).toEqual({
      allowed: false,
      reasons: ["Feedback portrait-message remains an open approval condition."]
    });
    expect((await validateProject(root, clearedBeforeResolution))
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `${diagnostic.code}:${diagnostic.subjectId}`))
      .toEqual(["feedback-condition-open:portrait-message"]);
    await runCli(
      "feedback", "resolve", "--root", root, "--id", "portrait-message",
      "--resolution", "Mina confirmed the protected left field and mobile crop.", "--artifact", "portrait-study"
    );
    expect((await validateProject(root, await store.load()))
      .filter((diagnostic) => diagnostic.severity === "error"))
      .toEqual([]);
    await runCli(
      "promote", "--root", root, "--artifact", "portrait-study", "--version", "1",
      "--path", ".creative-preproduction/artifacts/portrait-study-v2.html", "--rationale", "Ready for explicit creative review."
    );
    const promotedDraft = (await store.load()).artifacts.find((artifact) => artifact.id === "portrait-study" && artifact.version === 2)!;
    expect(promotedDraft).toMatchObject({
      id: "portrait-study",
      kind: "composition-study",
      version: 2,
      parentVersion: 1,
      path: ".creative-preproduction/artifacts/portrait-study-v2.html",
      status: "draft",
      visibility: "project",
      assetIds: ["campaign-portrait"],
      provider: "local-html-svg"
    });
    expect(promotedDraft).not.toBe(provisional);
    await runCli(
      "review", "--root", root, "--artifact", "portrait-study", "--version", "2", "--tier", "creative-lead",
      "--decision", "approved", "--reviewer", "Mina Shah", "--reviewer-id", "mina-shah",
      "--reason", "Mina approves the exact promoted composition version."
    );
    const promoted = (await store.load()).artifacts.filter((artifact) => artifact.id === "portrait-study");
    expect(promoted.map(({ version, status, parentVersion }) => ({ version, status, parentVersion }))).toEqual([
      { version: 1, status: "provisional", parentVersion: undefined },
      { version: 2, status: "approved", parentVersion: 1 }
    ]);

    await addApprovedArtifact(store, {
      id: "creative-brief", kind: "creative-brief", path: ".creative-preproduction/artifacts/creative-brief.md",
      contents: "# Creative brief\n\nMake River Voices feel like a civic stage for local storytellers.\n",
      rationale: "Sets the shared direction before research."
    });
    await transitionProject(store, "research");
    await addApprovedArtifact(store, {
      id: "research-board", kind: "research-board", path: ".creative-preproduction/artifacts/research-board.md",
      contents: "# Research board\n\nStudy editorial pacing without copying source layouts.\n",
      rationale: "Connects observed patterns to the approved brief."
    });
    const researched = await store.load();
    await store.save({
      ...researched,
      references: [{
        id: "editorial-reference", url: "https://example.com/editorial", title: "Editorial reference",
        relevance: "Tests pacing", lesson: "Vary density", avoidCopying: "Do not copy the layout",
        attribution: "Example Studio", licenseStatus: "not-applicable", licenseNotes: "Research only"
      }]
    });
    await transitionProject(store, "territories");
    await addApprovedArtifact(store, {
      id: "civic-stage", kind: "creative-territory", path: ".creative-preproduction/artifacts/civic-stage.md",
      contents: "# Civic stage\n\nUse the portrait as an invitation, not decoration.\n",
      rationale: "The selected direction respects the supplied image."
    });
    await addApprovedArtifact(store, {
      id: "neighborhood-voice", kind: "creative-territory", path: ".creative-preproduction/artifacts/neighborhood-voice.md",
      contents: "# Neighborhood voice\n\nTest a denser alternative.\n",
      rationale: "Keeps a distinct alternative reviewable."
    });
    await transitionProject(store, "visual-language");
    await addApprovedArtifact(store, {
      id: "visual-language", kind: "visual-language", path: ".creative-preproduction/artifacts/visual-language.md",
      contents: "# Visual language\n\nProtected negative space and responsive portrait crops define the composition.\n",
      rationale: "Records the selected visual system for implementation."
    });

    const readyForContext = await store.load();
    const [codex, claude] = await Promise.all([
      codexAdapter.build({ root, manifest: readyForContext }),
      claudeAdapter.build({ root, manifest: readyForContext })
    ]);
    expect({ ...codex, host: "neutral" }).toEqual({ ...claude, host: "neutral" });
    expect(codex.approvedContext.join("\n")).toContain("Protected negative space and responsive portrait crops");
    expect(codex.blockers).toEqual([]);

    await transitionProject(store, "exploration");
    await transitionProject(store, "review");
    await addApprovedArtifact(store, {
      id: "implementation-handoff", kind: "implementation-handoff", path: ".creative-preproduction/artifacts/implementation-handoff.md",
      contents: "# Implementation handoff\n\nBuild the approved composition with protected negative space.\n",
      rationale: "Packages the approved direction for implementation.",
      assetIds: ["campaign-portrait"]
    });
    await transitionProject(store, "handoff");
    const finalManifest = await store.load();
    expect(finalManifest.stage).toBe("handoff");
    const finalApproval = finalManifest.approvals.find((approval) =>
      approval.artifactId === "portrait-study" && approval.artifactVersion === 2
    );
    expect(finalApproval).toMatchObject({
      artifactId: "portrait-study",
      artifactVersion: 2,
      tier: "creative-lead",
      decision: "approved",
      reviewer: "Mina Shah",
      reviewerId: "mina-shah"
    });
    expect(finalManifest.feedback.find((feedback) => feedback.id === "portrait-message")?.originalText).toBe(originalFeedback);
    await expect(readFile(join(root, provisional.path), "utf8")).resolves.toContain("PRIVATE PROVISIONAL STUDY");
    expect(finalManifest.artifacts.find((artifact) => artifact.id === "portrait-study" && artifact.version === 2)?.assetIds)
      .toEqual(["campaign-portrait"]);
    expect(finalManifest.artifacts.find((artifact) => artifact.id === "implementation-handoff")?.assetIds)
      .toEqual(["campaign-portrait"]);
    expect((await validateProject(root, finalManifest)).filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});
