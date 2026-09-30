import { buildSharedCreativeDirectionContext, renderCreativeDirectionContext } from "./shared.js";
import type { AgentAdapter } from "./types.js";

export const codexAdapter: AgentAdapter = {
  host: "codex",
  async build(input) {
    return { host: "codex", ...await buildSharedCreativeDirectionContext(input) };
  },
  render(context) {
    return renderCreativeDirectionContext(context, "Codex");
  }
};
