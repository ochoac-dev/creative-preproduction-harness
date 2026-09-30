import type { Command } from "commander";
import { resolve } from "node:path";
import { validateProject } from "../services/validation.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerValidateCommand(program: Command): void {
  program.command("validate")
    .description("Check project integrity")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const root = resolve(options.root);
      const manifest = await new ProjectStore(root).load();
      const diagnostics = await validateProject(root, manifest);

      for (const diagnostic of diagnostics) {
        process.stdout.write(
          `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.subjectId}: ${diagnostic.message}\n`
        );
      }

      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        process.exitCode = 1;
      }
    });
}
