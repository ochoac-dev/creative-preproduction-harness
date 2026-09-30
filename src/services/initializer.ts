import { access, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProjectManifestSchema, type ProjectManifest } from "../domain/schema.js";
import { writeManifestAtomically } from "../storage/manifest-write.js";
import { PrivateWorkspace } from "../storage/private-workspace.js";
import { findHarnessPackage } from "./package-info.js";

export interface InitOptions {
  root: string;
  id: string;
  name: string;
  kind: "new-site" | "existing-site";
  now?: Date;
}

const templateNames = ["brief.md", "decision-journal.md", "research-board.md", "asset-dossier.md"] as const;

const existingSiteAudit = `# Existing Site Audit

## Preserved strengths

## Hierarchy

## Composition

## Consistency

## Responsiveness

## Usability

## Accessibility

## Content flow

## Identity opportunities
`;

export async function initializeProject(options: InitOptions): Promise<ProjectManifest> {
  const workspace = join(options.root, ".creative-preproduction");
  const manifestPath = join(workspace, "manifest.json");

  const harness = await findHarnessPackage();
  const timestamp = (options.now ?? new Date()).toISOString();
  const manifest = ProjectManifestSchema.parse({
    schemaVersion: 2,
    harnessVersion: harness.version,
    project: { id: options.id, name: options.name, kind: options.kind },
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
  });
  await writeManifestAtomically(manifestPath, async () => {
    let manifestExists = true;
    try {
      await access(manifestPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      manifestExists = false;
    }
    if (manifestExists) {
      throw new Error(`Project at ${options.root} is already initialized`);
    }

    await new PrivateWorkspace(options.root).initialize();
    for (const templateName of templateNames) {
      await copyFile(join(harness.root, "templates", templateName), join(workspace, templateName));
    }
    if (options.kind === "existing-site") {
      await writeFile(join(workspace, "existing-site-audit.md"), existingSiteAudit, "utf8");
    }

    return `${JSON.stringify(manifest, null, 2)}\n`;
  });

  return manifest;
}
