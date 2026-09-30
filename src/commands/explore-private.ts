import type { Command } from "commander";
import { resolve } from "node:path";
import { createPrivateHtmlStudy } from "../providers/html-svg.js";
import { PrivateWorkspace } from "../storage/private-workspace.js";
import { ProjectStore } from "../storage/project-store.js";

function collect(value: string, values: string[] = []): string[] {
  return [...values, value];
}

export function registerExplorePrivateCommand(program: Command): void {
  program.command("explore-private")
    .description("Create a private provisional HTML/SVG study")
    .requiredOption("--id <slug>")
    .requiredOption("--title <title>")
    .requiredOption("--question <text>")
    .requiredOption("--rationale <text>")
    .requiredOption("--asset <id>", "referenced asset", collect, [])
    .option("--assumption <text>", "study assumption", collect, [])
    .option("--note <text>", "composition note", collect, [])
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      if (options.asset.length === 0) {
        throw new Error("Private studies require at least one --asset.");
      }
      const root = resolve(options.root);
      const store = new ProjectStore(root);
      let result: Awaited<ReturnType<typeof createPrivateHtmlStudy>> | undefined;
      await store.mutate(async (manifest) => {
        result = await createPrivateHtmlStudy(root, manifest, {
          id: options.id,
          title: options.title,
          question: options.question,
          rationale: options.rationale,
          assumptions: options.assumption,
          assetIds: options.asset,
          compositionNotes: options.note
        });
        return { ...manifest, artifacts: [...manifest.artifacts, result.artifact] };
      }, async () => {
        if (result?.ownership === "created") {
          await new PrivateWorkspace(root).removeStudy(result.artifact.id, result.artifact.version);
        }
      });
      process.stdout.write(`Created private study ${options.id} at ${result!.previewPath}.\n`);
    });
}
