#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAssetCommands } from "./commands/assets.js";
import { registerContextCommand } from "./commands/context.js";
import { registerExplorePrivateCommand } from "./commands/explore-private.js";
import { registerFeedbackCommands } from "./commands/feedback.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMigrateCommand } from "./commands/migrate.js";
import { registerParticipantCommands } from "./commands/participants.js";
import { registerPromoteCommand } from "./commands/promote.js";
import { registerQuestionsCommand } from "./commands/questions.js";
import { registerReviewCommand } from "./commands/review.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerValidateCommand } from "./commands/validate.js";

export function createProgram(): Command {
  const program = new Command()
    .name("creative-preproduction")
    .enablePositionalOptions()
    .description("Guide and preserve creative preproduction for website projects")
    .version("0.1.0");

  registerInitCommand(program);
  registerMigrateCommand(program);
  registerStatusCommand(program);
  registerContextCommand(program);
  registerValidateCommand(program);
  registerParticipantCommands(program);
  registerAssetCommands(program);
  registerFeedbackCommands(program);
  registerQuestionsCommand(program);
  registerExplorePrivateCommand(program);
  registerPromoteCommand(program);
  registerReviewCommand(program);
  return program;
}

export function isDirectExecution(moduleUrl: string, executablePath: string | undefined): boolean {
  return executablePath !== undefined && fileURLToPath(moduleUrl) === resolve(executablePath);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  await createProgram().parseAsync(process.argv);
}
