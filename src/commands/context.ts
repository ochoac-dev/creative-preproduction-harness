import type { Command } from "commander";
import { resolve } from "node:path";
import { claudeAdapter } from "../adapters/claude.js";
import { codexAdapter } from "../adapters/codex.js";
import type { AgentAdapter } from "../adapters/types.js";
import { ProjectStore } from "../storage/project-store.js";

function adapterFor(host: string): AgentAdapter {
  if (host === "codex") {
    return codexAdapter;
  }
  if (host === "claude") {
    return claudeAdapter;
  }
  throw new Error("Context host must be codex or claude.");
}

export function registerContextCommand(program: Command): void {
  program.command("context")
    .description("Render creative-direction context for an agent host")
    .requiredOption("--host <codex|claude>", "agent host")
    .requiredOption("--root <path>", "website repository")
    .action(async (options) => {
      const root = resolve(options.root);
      const manifest = await new ProjectStore(root).load();
      const adapter = adapterFor(options.host);
      process.stdout.write(adapter.render(await adapter.build({ root, manifest })));
    });
}
