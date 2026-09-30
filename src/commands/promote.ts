import type { Command } from "commander";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { promoteProvisionalArtifact } from "../services/provisional.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerPromoteCommand(program: Command): void {
  program.command("promote")
    .description("Promote a private provisional artifact for project review")
    .requiredOption("--artifact <id>")
    .requiredOption("--version <number>")
    .requiredOption("--path <project-relative-path>")
    .requiredOption("--rationale <text>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const root = resolve(options.root);
      const version = Number(options.version);
      const store = new ProjectStore(root);
      const manifest = await store.load();
      const artifact = manifest.artifacts.find((candidate) => candidate.id === options.artifact && candidate.version === version);
      if (artifact === undefined) {
        throw new Error(`Artifact ${options.artifact} v${options.version} does not exist.`);
      }
      const promoted = promoteProvisionalArtifact(artifact, manifest, {
        path: options.path,
        rationale: options.rationale
      });
      await access(resolve(root, promoted.path));
      await store.save({ ...manifest, artifacts: [...manifest.artifacts, promoted] });
      process.stdout.write(`Promoted ${options.artifact} v${version} to v${promoted.version}.\n`);
    });
}
