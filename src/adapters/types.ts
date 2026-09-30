import type { CreativePosture } from "../creative-direction/coordinator.js";
import type { QuestionPacketItem } from "../creative-direction/questions.js";
import type { ProjectManifest, Stage } from "../domain/schema.js";

export type AgentHost = "codex" | "claude";

export interface CreativeDirectionContext {
  host: AgentHost;
  projectName: string;
  stage: Stage;
  postures: CreativePosture[];
  instructions: string[];
  approvedContext: string[];
  suppliedAssets: string[];
  feedback: Array<{ original: string; interpretation: string }>;
  questions: QuestionPacketItem[];
  blockers: string[];
  nextAction: string;
}

export interface AgentAdapter {
  readonly host: AgentHost;
  build(input: { root: string; manifest: ProjectManifest }): Promise<CreativeDirectionContext>;
  render(context: CreativeDirectionContext): string;
}
