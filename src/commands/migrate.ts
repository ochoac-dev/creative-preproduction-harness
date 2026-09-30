import type { Command } from "commander";
import { resolve } from "node:path";
import { findHarnessPackage } from "../services/package-info.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerMigrateCommand(program: Command): void {
  program.command("migrate")
    .description("Migrate a project manifest to the current schema")
    .requiredOption("--root <path>", "website repository")
    .action(async (options) => {
      const manifest = await new ProjectStore(resolve(options.root)).migrate((await findHarnessPackage()).version);
      process.stdout.write(`Migrated ${manifest.project.name} to schema version 2\n`);
    });
}
