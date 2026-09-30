import type { Command } from "commander";
import { resolve } from "node:path";
import { buildQuestionPacket } from "../creative-direction/questions.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerQuestionsCommand(program: Command): void {
  program.command("questions")
    .description("Show unresolved creative questions")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const manifest = await new ProjectStore(resolve(options.root)).load();
      const packet = buildQuestionPacket(manifest);
      const lines = [`Postures: ${packet.postures.join(", ")}`];
      if (packet.recipientParticipantId !== undefined) {
        lines.push(`Recipient: ${packet.recipientParticipantId}`);
      }
      if (packet.items.length === 0) {
        lines.push("No unresolved creative questions.");
      } else {
        lines.push(...packet.items.map((item) => `- ${item.source}: ${item.question}`));
      }
      process.stdout.write(`${lines.join("\n")}\n`);
    });
}
