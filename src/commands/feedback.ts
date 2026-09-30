import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FeedbackClassificationSchema } from "../domain/schema.js";
import { addFeedback, createFeedback, resolveFeedback } from "../services/feedback.js";
import { ProjectStore } from "../storage/project-store.js";

function collect(value: string, values: string[] = []): string[] {
  return [...values, value];
}

export function registerFeedbackCommands(program: Command): void {
  const feedback = program.command("feedback").description("Import and resolve creative feedback");

  feedback.command("import")
    .requiredOption("--id <slug>")
    .option("--message <text>")
    .option("--file <path>")
    .requiredOption("--source <description>")
    .requiredOption("--class <classification>", "feedback classification", collect, [])
    .requiredOption("--interpretation <text>")
    .option("--target-kind <kind>")
    .option("--target-id <id>")
    .option("--target-version <number>")
    .option("--author <name>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      if ((options.message === undefined) === (options.file === undefined)) {
        throw new Error("Provide exactly one of --message or --file.");
      }
      if ((options.targetKind === undefined) !== (options.targetId === undefined) || (
        options.targetVersion !== undefined && options.targetKind === undefined
      )) {
        throw new Error("Feedback targets require --target-kind and --target-id together.");
      }
      const root = resolve(options.root);
      const originalText = options.file === undefined ? options.message : await readFile(resolve(options.file), "utf8");
      const classifications = options.class.map((classification: string) => FeedbackClassificationSchema.parse(classification));
      const store = new ProjectStore(root);
      const manifest = await store.load();
      const created = createFeedback({
        id: options.id,
        originalText,
        ...(options.author === undefined ? {} : { author: options.author }),
        source: options.source,
        classifications,
        interpretation: options.interpretation,
        ...(options.targetKind === undefined ? {} : {
          target: {
            kind: options.targetKind,
            id: options.targetId,
            ...(options.targetVersion === undefined ? {} : { version: Number(options.targetVersion) })
          }
        })
      });
      await store.save(addFeedback(manifest, created));
      process.stdout.write(`Imported feedback ${options.id}.\n`);
    });

  feedback.command("resolve")
    .requiredOption("--id <slug>")
    .requiredOption("--resolution <text>")
    .option("--artifact <id>", "resulting artifact", collect, [])
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const store = new ProjectStore(resolve(options.root));
      const manifest = await store.load();
      await store.save(resolveFeedback(manifest, {
        feedbackId: options.id,
        resolution: options.resolution,
        resultingArtifactIds: options.artifact
      }));
      process.stdout.write(`Resolved feedback ${options.id}.\n`);
    });
}
