import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import type { ProjectManifest } from "../../src/domain/schema.js";
import { validateProject } from "../../src/services/validation.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const timestamp = "2026-09-16T18:00:00.000Z";
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "creative-preproduction-validation-"));
  temporaryRoots.push(root);
  return root;
}

function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: 2,
    harnessVersion: "0.1.0",
    project: { id: "museum", name: "Museum", kind: "new-site" },
    stage: "research",
    participants: [],
    decisionOwners: [],
    artifacts: [],
    approvals: [],
    assets: [],
    feedback: [],
    references: [],
    unresolvedQuestions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("validateProject", () => {
  it("reports unknown licensing and missing local artifact files", async () => {
    const root = await temporaryRoot();
    const project = manifest({
      artifacts: [{
        id: "brief",
        kind: "creative-brief",
        version: 1,
        path: "missing.md",
        status: "approved",
        visibility: "project",
        assetIds: [],
        rationale: "Confirmed with the team.",
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      references: [{
        id: "ref-1",
        url: "https://example.com",
        title: "Example",
        relevance: "Editorial pacing",
        lesson: "Vary section density",
        avoidCopying: "Do not reproduce the grid",
        attribution: "Example Studio",
        licenseStatus: "unknown",
        licenseNotes: "Usage rights have not been verified"
      }]
    });

    const diagnostics = await validateProject(root, project);

    expect(diagnostics).toEqual([
      {
        code: "artifact-file-missing",
        severity: "error",
        subjectId: "brief",
        message: 'Artifact file "missing.md" does not exist.'
      },
      {
        code: "reference-license-unknown",
        severity: "warning",
        subjectId: "ref-1",
        message: "Reference licensing is unknown: Usage rights have not been verified"
      }
    ]);
  });

  it("distinguishes approvals for absent artifacts from absent versions", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "brief.md"), "# Brief\n", "utf8");
    const project = manifest({
      artifacts: [{
        id: "brief",
        kind: "creative-brief",
        version: 1,
        path: "brief.md",
        status: "approved",
        visibility: "project",
        assetIds: [],
        rationale: "Confirmed with the team.",
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      approvals: [
        {
          id: "orphaned-approval",
          artifactId: "missing-artifact",
          artifactVersion: 1,
          tier: "peer",
          decision: "approved",
          reviewer: "Morgan Lee",
          reason: "Ready.",
          createdAt: timestamp
        },
        {
          id: "wrong-version-approval",
          artifactId: "brief",
          artifactVersion: 2,
          tier: "creative-lead",
          decision: "approved",
          reviewer: "Mina Shah",
          reason: "Ready.",
          createdAt: timestamp
        }
      ]
    });

    const diagnostics = await validateProject(root, project);

    expect(diagnostics).toEqual([
      {
        code: "approval-artifact-missing",
        severity: "error",
        subjectId: "orphaned-approval",
        message: 'Approval targets missing artifact "missing-artifact".'
      },
      {
        code: "approval-version-missing",
        severity: "error",
        subjectId: "wrong-version-approval",
        message: 'Approval targets missing version 2 of artifact "brief".'
      }
    ]);
  });

  it("reports each duplicate artifact version once and sorts by code then subject id", async () => {
    const root = await temporaryRoot();
    await Promise.all([
      writeFile(join(root, "alpha-a.md"), "alpha a", "utf8"),
      writeFile(join(root, "alpha-b.md"), "alpha b", "utf8"),
      writeFile(join(root, "zeta-a.md"), "zeta a", "utf8"),
      writeFile(join(root, "zeta-b.md"), "zeta b", "utf8")
    ]);
    const artifact = (id: string, path: string) => ({
      id,
      kind: "creative-territory" as const,
      version: 1,
      path,
      status: "draft" as const,
      visibility: "project" as const,
      assetIds: [],
      rationale: "Explores a distinct direction.",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const project = manifest({
      artifacts: [
        artifact("zeta", "zeta-a.md"),
        artifact("alpha", "alpha-a.md"),
        artifact("zeta", "zeta-b.md"),
        artifact("alpha", "alpha-b.md")
      ]
    });

    const diagnostics = await validateProject(root, project);

    expect(diagnostics).toEqual([
      {
        code: "duplicate-artifact-version",
        severity: "error",
        subjectId: "alpha",
        message: 'Artifact "alpha" has duplicate version 1.'
      },
      {
        code: "duplicate-artifact-version",
        severity: "error",
        subjectId: "zeta",
        message: 'Artifact "zeta" has duplicate version 1.'
      }
    ]);
  });

  it("returns no diagnostics for structurally valid local records", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "brief.md"), "# Brief\n", "utf8");
    const project = manifest({
      artifacts: [{
        id: "brief",
        kind: "creative-brief",
        version: 1,
        path: "artifacts/brief.md",
        status: "approved",
        visibility: "project",
        assetIds: [],
        rationale: "Confirmed with the team.",
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      approvals: [{
        id: "brief-approval",
        artifactId: "brief",
        artifactVersion: 1,
        tier: "creative-lead",
        decision: "approved",
        reviewer: "Mina Shah",
        reason: "Ready.",
        createdAt: timestamp
      }],
      references: [{
        id: "ref-1",
        url: "https://example.com",
        title: "Example",
        relevance: "Editorial pacing",
        lesson: "Vary section density",
        avoidCopying: "Do not reproduce the grid",
        attribution: "Example Studio",
        licenseStatus: "verified",
        licenseNotes: "Licensed for internal reference"
      }]
    });

    await expect(validateProject(root, project)).resolves.toEqual([]);
  });

  it("reports extension policy diagnostics with stable codes, severities, and ordering", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "artifacts"), { recursive: true });
    await Promise.all([
      writeFile(join(root, "artifacts", "visual-language.md"), "visual language", "utf8"),
      writeFile(join(root, "artifacts", "handoff.md"), "handoff", "utf8")
    ]);
    const visualLanguage = {
      id: "visual-language",
      kind: "visual-language" as const,
      version: 1,
      path: "artifacts/visual-language.md",
      status: "approved" as const,
      visibility: "project" as const,
      assetIds: ["private-portrait"],
      provider: "figma" as const,
      rationale: "Defines the selected direction.",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const handoff = {
      id: "handoff",
      kind: "implementation-handoff" as const,
      version: 1,
      path: "artifacts/handoff.md",
      status: "approved" as const,
      visibility: "project" as const,
      assetIds: ["private-study"],
      rationale: "Packages the selected direction.",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const privateStudy = {
      id: "private-study",
      kind: "composition-study" as const,
      version: 1,
      path: ".creative-preproduction/private/studies/private-study/v1/index.html",
      status: "provisional" as const,
      visibility: "private" as const,
      assetIds: [],
      question: "Should this direction proceed?",
      assumptions: [],
      blockers: [],
      rationale: "Tests a private direction.",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const project = manifest({
      participants: [{ id: "mina-shah", name: "Mina Shah", role: "creative-lead", createdAt: timestamp }],
      decisionOwners: [{ area: "creative-direction", participantId: "mina-shah" }],
      artifacts: [
        visualLanguage,
        handoff,
        privateStudy,
        {
          ...visualLanguage,
          id: "unsafe-path",
          kind: "decision-journal",
          path: "../outside.md",
          status: "draft",
          assetIds: []
        }
      ],
      approvals: [
        {
          id: "visual-language-approval",
          artifactId: visualLanguage.id,
          artifactVersion: visualLanguage.version,
          tier: "stakeholder",
          decision: "approved",
          reviewer: "Alex Chen",
          reviewerId: "alex-chen",
          reason: "Proceed.",
          createdAt: timestamp
        },
        {
          id: "handoff-approval",
          artifactId: handoff.id,
          artifactVersion: handoff.version,
          tier: "creative-lead",
          decision: "approved",
          reviewer: "Mina Shah",
          reviewerId: "mina-shah",
          reason: "Proceed.",
          createdAt: timestamp
        }
      ],
      assets: [{
        id: "private-portrait",
        title: "Private portrait",
        source: "Client handoff",
        intendedRole: "Lead image",
        modificationPolicy: "adaptable",
        rightsStatus: "unknown",
        providerScopes: ["local-html-svg"],
        storage: { kind: "private", ref: "private-portrait" },
        allowedTreatments: [],
        prohibitedTreatments: [],
        visualNotes: {},
        responsiveGuidance: "Protect the face.",
        accessibilityIntent: "Describe the artist.",
        relatedArtifactIds: [],
        relatedFeedbackIds: [],
        unresolvedQuestions: [],
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      feedback: [
        {
          id: "condition-1",
          originalText: "Confirm the crop.",
          source: "Review notes",
          classifications: ["approval-condition"],
          interpretation: "The crop remains conditional.",
          resolutionStatus: "open",
          resultingArtifactIds: [],
          createdAt: timestamp,
          updatedAt: timestamp
        },
        {
          id: "missing-target",
          originalText: "Which version is this about?",
          source: "Email",
          classifications: ["question"],
          interpretation: "The target is unclear.",
          resolutionStatus: "open",
          resultingArtifactIds: [],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    });

    const diagnostics = await validateProject(root, project);

    expect(diagnostics).toEqual([
      {
        code: "asset-private-reference",
        severity: "error",
        subjectId: "private-portrait",
        message: "Private asset private-portrait is referenced by project-visible artifact visual-language v1."
      },
      {
        code: "asset-provider-blocked",
        severity: "error",
        subjectId: "private-portrait",
        message: "Asset private-portrait has unknown rights and is limited to private local HTML/SVG studies."
      },
      {
        code: "asset-rights-blocked",
        severity: "error",
        subjectId: "private-portrait",
        message: "Asset private-portrait has unknown rights and cannot be used by project-visible artifact visual-language v1."
      },
      {
        code: "decision-owner-approval-missing",
        severity: "error",
        subjectId: "visual-language",
        message: "Artifact visual-language v1 requires approval from creative-direction owner mina-shah."
      },
      {
        code: "feedback-condition-open",
        severity: "error",
        subjectId: "condition-1",
        message: "Feedback condition-1 remains an open approval condition."
      },
      {
        code: "feedback-target-missing",
        severity: "warning",
        subjectId: "condition-1",
        message: "Feedback condition-1 does not identify a target."
      },
      {
        code: "feedback-target-missing",
        severity: "warning",
        subjectId: "missing-target",
        message: "Feedback missing-target does not identify a target."
      },
      {
        code: "legacy-handoff-artifact-reference",
        severity: "warning",
        subjectId: "handoff",
        message: "Implementation handoff handoff v1 stores artifact reference private-study in assetIds; this legacy form is deprecated. Use an asset's relatedArtifactIds for future handoffs."
      },
      {
        code: "private-file-missing",
        severity: "warning",
        subjectId: "private-portrait",
        message: "Private source for asset private-portrait is missing."
      },
      {
        code: "private-file-missing",
        severity: "warning",
        subjectId: "private-study",
        message: `Private artifact file "${privateStudy.path}" does not exist.`
      },
      {
        code: "provisional-in-handoff",
        severity: "error",
        subjectId: "private-study",
        message: "Implementation handoff handoff references provisional or private artifact private-study v1."
      },
      {
        code: "tracked-path-unsafe",
        severity: "error",
        subjectId: "unsafe-path",
        message: "Tracked artifact unsafe-path v1 has an unsafe project path."
      }
    ]);
  });

  it("rejects an existing private artifact file outside the private workspace", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(join(root, "public", "study.html"), "private study", "utf8");
    const project = manifest({
      artifacts: [{
        id: "private-study",
        kind: "composition-study",
        version: 1,
        path: "public/study.html",
        status: "draft",
        visibility: "private",
        assetIds: [],
        rationale: "A private study that has not been promoted.",
        createdAt: timestamp,
        updatedAt: timestamp
      }]
    });

    await expect(validateProject(root, project)).resolves.toEqual([{
      code: "tracked-path-unsafe",
      severity: "error",
      subjectId: "private-study",
      message: "Tracked artifact private-study v1 has an unsafe project path."
    }]);
  });
});

describe("validate command", () => {
  it("prints stable diagnostics and exits nonzero when errors exist", async () => {
    const root = await temporaryRoot();
    await new ProjectStore(root).save(manifest({
      artifacts: [{
        id: "brief",
        kind: "creative-brief",
        version: 1,
        path: "missing.md",
        status: "draft",
        visibility: "project",
        assetIds: [],
        rationale: "Work in progress.",
        createdAt: timestamp,
        updatedAt: timestamp
      }],
      references: [{
        id: "ref-1",
        url: "https://example.com",
        title: "Example",
        relevance: "Editorial pacing",
        lesson: "Vary section density",
        avoidCopying: "Do not reproduce the grid",
        attribution: "Example Studio",
        licenseStatus: "unknown",
        licenseNotes: "Rights review is pending"
      }]
    }));
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    await createProgram().parseAsync(["node", "creative-preproduction", "validate", "--root", root]);

    expect(output).toBe(
      "ERROR artifact-file-missing brief: Artifact file \"missing.md\" does not exist.\n" +
      "WARNING reference-license-unknown ref-1: Reference licensing is unknown: Rights review is pending\n"
    );
    expect(process.exitCode).toBe(1);
  });

  it("does not exit nonzero for warnings alone", async () => {
    const root = await temporaryRoot();
    await new ProjectStore(root).save(manifest({
      references: [{
        id: "ref-1",
        url: "https://example.com",
        title: "Example",
        relevance: "Editorial pacing",
        lesson: "Vary section density",
        avoidCopying: "Do not reproduce the grid",
        attribution: "Example Studio",
        licenseStatus: "unknown",
        licenseNotes: "Rights review is pending"
      }]
    }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram().parseAsync(["node", "creative-preproduction", "validate", "--root", root]);

    expect(process.exitCode).toBeUndefined();
  });
});
