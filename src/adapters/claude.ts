import { buildSharedCreativeDirectionContext, renderCreativeDirectionContext } from "./shared.js";
import type { AgentAdapter } from "./types.js";

export const claudeAdapter: AgentAdapter = {
  host: "claude",
  async build(input) {
    return { host: "claude", ...await buildSharedCreativeDirectionContext(input) };
  },
  render(context) {
    return renderCreativeDirectionContext(context, "Claude");
  }
};
