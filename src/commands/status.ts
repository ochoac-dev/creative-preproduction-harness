import type { Command } from "commander";
import { resolve } from "node:path";
import { describeNextCreativeAction, determinePostures } from "../creative-direction/coordinator.js";
import { canTransition, stages } from "../domain/workflow.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerStatusCommand(program: Command): void {
  program.command("status")
    .description("Show project workflow status")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const store = new ProjectStore(resolve(options.root));
      const manifest = await store.inspect();
      if (manifest.schemaVersion === 1) {
        process.stdout.write([
          `Project: ${manifest.project.name}`,
          `Kind: ${manifest.project.kind}`,
          `Current stage: ${manifest.stage}`,
          "Migration required: run creative-preproduction migrate --root <project-root>."
        ].join("\n").concat("\n"));
        return;
      }
      const openFeedback = manifest.feedback.filter((feedback) => feedback.resolutionStatus === "open").length;
      const provisional = manifest.artifacts.filter((artifact) => artifact.status === "provisional").length;
      const lines = [
        `Project: ${manifest.project.name}`,
        `Kind: ${manifest.project.kind}`,
        `Current stage: ${manifest.stage}`,
        `Artifacts: ${manifest.artifacts.length}`,
        `Participants: ${manifest.participants.length}`,
        `Assets: ${manifest.assets.length}`,
        `Open feedback: ${openFeedback}`,
        `Provisional artifacts: ${provisional}`,
        `Unresolved questions: ${manifest.unresolvedQuestions.length}`,
        `Creative postures: ${determinePostures(manifest).join(", ")}`,
        `Next creative action: ${describeNextCreativeAction(manifest)}`
      ];
      if (manifest.unresolvedQuestions.length > 0) {
        lines.push(...manifest.unresolvedQuestions.map((question) => `- ${question}`));
      }
      const currentIndex = stages.indexOf(manifest.stage);

      if (currentIndex === stages.length - 1) {
        lines.push("Handoff reached; no forward transition remains.");
      } else {
        const nextStage = stages[currentIndex + 1];
        if (nextStage === undefined) {
          throw new Error(`No next stage is defined after ${manifest.stage}`);
        }
        lines.push(`Next stage: ${nextStage}`);
        const transition = canTransition(manifest, nextStage);
        if (transition.allowed) {
          lines.push(`Ready to transition to ${nextStage}.`);
        } else {
          lines.push("Unmet requirements:", ...transition.reasons.map((reason) => `- ${reason}`));
        }
      }

      process.stdout.write(`${lines.join("\n")}\n`);
    });
}
