#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { realpathSync } from "node:fs";
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
import { registerArtifactCommands } from "./commands/artifacts.js";
import { registerReferenceCommands } from "./commands/references.js";
import { registerStageCommands } from "./commands/stages.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerGuideCommand } from "./commands/guide.js";
import { findHarnessPackage } from "./services/package-info.js";
import { ZodError } from "zod";

const harnessPackage = await findHarnessPackage();

export function createProgram(): Command {
  const program = new Command()
    .name("creative-preproduction")
    .enablePositionalOptions()
    .option("--debug", "include error stack traces")
    .description("Guide and preserve creative preproduction for website projects")
    .version(harnessPackage.version);

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
  registerArtifactCommands(program);
  registerReferenceCommands(program);
  registerStageCommands(program);
  registerDoctorCommand(program);
  registerGuideCommand(program, async (arguments_) => {
    await createProgram().exitOverride().parseAsync(["node", "creative-preproduction", ...arguments_]);
  });
  return program;
}

export function isDirectExecution(moduleUrl: string, executablePath: string | undefined): boolean {
  if (executablePath === undefined) return false;
  const canonical = (path: string): string => {
    try { return realpathSync(path); } catch { return resolve(path); }
  };
  return canonical(fileURLToPath(moduleUrl)) === canonical(executablePath);
}

export function formatCliError(error: unknown, debug = false): string {
  if (debug && error instanceof Error && error.stack) return `${error.stack}\n`;
  if (error instanceof ZodError) {
    return `Error: Invalid input. ${error.issues.map(issue => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ")}\nUse --help to see accepted options.\n`;
  }
  const detail = error as NodeJS.ErrnoException;
  if (detail?.code === "ENOENT") {
    if (detail.path?.endsWith("manifest.json")) return `Error: No initialized project found at ${detail.path}.\nRun creative-preproduction init --root <project> --id <slug> --name <name> --kind <new-site|existing-site>.\n`;
    return `Error: File not found: ${detail.path ?? detail.message}.\nCheck the path and try again.\n`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const next = /writer|lock|recover/i.test(message) ? "\nRun creative-preproduction doctor --root <project> to inspect the lock; recover only an abandoned owner." : "";
  return `Error: ${message.replace(/^error:\s*/i, "")}${next}\n`;
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createProgram().exitOverride();
  program.configureOutput({ outputError: () => {} });
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    process.stderr.write(formatCliError(error, argv.includes("--debug")));
    process.exitCode = 1;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  await runCli();
}
