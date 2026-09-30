import type { Command } from "commander";
import { resolve } from "node:path";
import { initializeProject } from "../services/initializer.js";

export function registerInitCommand(program: Command): void {
  program.command("init")
    .requiredOption("--id <slug>")
    .requiredOption("--name <name>")
    .requiredOption("--kind <kind>", "new-site or existing-site")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const manifest = await initializeProject({
        root: resolve(options.root),
        id: options.id,
        name: options.name,
        kind: options.kind
      });
      process.stdout.write(`Initialized ${manifest.project.name} at stage ${manifest.stage}\n`);
    });
}
