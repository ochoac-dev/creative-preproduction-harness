import { Option, type Command } from "commander";
import { resolve } from "node:path";
import { StageSchema } from "../domain/schema.js";
import { advanceProjectStage, checkProjectStage } from "../services/workflow-actions.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerStageCommands(program: Command): void {
  const stage = program.command("stage").description("Check requirements and explicitly advance one stage");

  stage.command("check")
    .description("Check an adjacent forward transition without saving")
    .addOption(new Option("--to <stage>", "next stage").choices(StageSchema.options).makeOptionMandatory())
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const result = await checkProjectStage(new ProjectStore(resolve(options.root)), options.to);
      if (result.allowed) {
        process.stdout.write(`Can advance to stage ${options.to}.\n`);
      } else {
        process.stdout.write(`Blocked from advancing to stage ${options.to}:\n${result.reasons.map((reason) => `- ${reason}`).join("\n")}\n`);
        process.exitCode = 1;
      }
    });

  stage.command("advance")
    .description("Validate project integrity and save an adjacent forward transition")
    .addOption(new Option("--to <stage>", "next stage").choices(StageSchema.options).makeOptionMandatory())
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      await advanceProjectStage(new ProjectStore(resolve(options.root)), options.to);
      process.stdout.write(`Advanced to stage ${options.to}.\n`);
    });
}
