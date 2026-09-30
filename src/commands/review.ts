import type { Command } from "commander";
import { resolve } from "node:path";
import { applyReviewDecision } from "../services/artifacts.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerReviewCommand(program: Command): void {
  program.command("review")
    .description("Record an explicit review decision for one artifact version")
    .requiredOption("--artifact <id>")
    .requiredOption("--version <number>")
    .requiredOption("--tier <tier>")
    .requiredOption("--decision <decision>")
    .requiredOption("--reviewer <name>")
    .option("--reviewer-id <participant-id>")
    .requiredOption("--reason <text>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const store = new ProjectStore(resolve(options.root));
      const manifest = await store.load();
      await store.save(applyReviewDecision(manifest, {
        artifactId: options.artifact,
        artifactVersion: Number(options.version),
        tier: options.tier,
        decision: options.decision,
        reviewer: options.reviewer,
        ...(options.reviewerId === undefined ? {} : { reviewerId: options.reviewerId }),
        reason: options.reason
      }));
      process.stdout.write(`Recorded ${options.decision} review for ${options.artifact} v${options.version}.\n`);
    });
}
