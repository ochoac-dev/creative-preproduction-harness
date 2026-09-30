import { Option, type Command } from "commander";
import { resolve } from "node:path";
import { addProjectReference } from "../services/workflow-actions.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerReferenceCommands(program: Command): void {
  const reference = program.command("reference").description("Record research sources, lessons, and licensing");

  reference.command("add")
    .description("Record a complete research reference")
    .requiredOption("--id <id>", "reference identity")
    .requiredOption("--url <url>", "source URL")
    .requiredOption("--title <title>", "reference title")
    .requiredOption("--relevance <text>", "why the source relates to this project")
    .requiredOption("--lesson <text>", "what to learn from the source")
    .requiredOption("--avoid-copying <text>", "elements to avoid copying")
    .requiredOption("--attribution <text>", "source attribution")
    .addOption(new Option("--license-status <status>", "source licensing status")
      .choices(["verified", "unknown", "not-applicable"]).makeOptionMandatory())
    .requiredOption("--license-notes <text>", "licensing evidence or limitations")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      await addProjectReference(new ProjectStore(resolve(options.root)), {
        id: options.id, url: options.url, title: options.title, relevance: options.relevance,
        lesson: options.lesson, avoidCopying: options.avoidCopying, attribution: options.attribution,
        licenseStatus: options.licenseStatus, licenseNotes: options.licenseNotes
      });
      process.stdout.write(`Added reference ${options.id}.\n`);
    });

  reference.command("list")
    .description("Show recorded sources, reasoning, and licensing")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const manifest = await new ProjectStore(resolve(options.root)).load();
      process.stdout.write(`${JSON.stringify(manifest.references, null, 2)}\n`);
    });
}
