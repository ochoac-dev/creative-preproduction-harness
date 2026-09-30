import type { Command } from "commander";
import { resolve } from "node:path";
import { addParticipant, setDecisionOwner } from "../services/participants.js";
import { ProjectStore } from "../storage/project-store.js";

export function registerParticipantCommands(program: Command): void {
  const participant = program.command("participant").description("Manage project participants and decision owners");

  participant.command("add")
    .requiredOption("--id <slug>")
    .requiredOption("--name <name>")
    .requiredOption("--role <role>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const store = new ProjectStore(resolve(options.root));
      const manifest = await store.load();
      const updated = addParticipant(manifest, {
        id: options.id,
        name: options.name,
        role: options.role
      });
      await store.save(updated);
      process.stdout.write(`Added participant ${options.id}.\n`);
    });

  participant.command("own")
    .requiredOption("--area <area>")
    .requiredOption("--participant <id>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const store = new ProjectStore(resolve(options.root));
      const manifest = await store.load();
      const updated = setDecisionOwner(manifest, {
        area: options.area,
        participantId: options.participant
      });
      await store.save(updated);
      process.stdout.write(`Assigned ${options.area} to ${options.participant}.\n`);
    });
}
