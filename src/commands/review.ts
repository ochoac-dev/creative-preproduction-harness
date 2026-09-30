import type { Command } from "commander";
import { resolve } from "node:path";
import { applyReviewDecision } from "../services/artifacts.js";
import { assertUnusedProjectArtifactFile } from "../storage/artifact-file.js";
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
      await store.mutate(async (manifest) => {
        const version = Number(options.version);
        const artifact = manifest.artifacts.find((candidate) => candidate.id === options.artifact && candidate.version === version);
        if (artifact === undefined) throw new Error(`Artifact ${options.artifact} v${version} does not exist.`);
        if (options.decision === "approved" || options.decision === "approved-with-conditions") {
          if (artifact.visibility !== "project" || artifact.status === "provisional") {
            throw new Error("Private or provisional artifacts cannot be approved; promote the work to a project draft first.");
          }
          await assertUnusedProjectArtifactFile(store.root, manifest, artifact.path, artifact);
        }
        return applyReviewDecision(manifest, {
          artifactId: options.artifact,
          artifactVersion: version,
          tier: options.tier,
          decision: options.decision,
          reviewer: options.reviewer,
          ...(options.reviewerId === undefined ? {} : { reviewerId: options.reviewerId }),
          reason: options.reason
        });
      });
      process.stdout.write(`Recorded ${options.decision} review for ${options.artifact} v${options.version}.\n`);
    });
}
