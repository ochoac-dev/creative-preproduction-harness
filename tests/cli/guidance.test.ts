import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runGuide, type GuideIO } from "../../src/guidance/guide.js";
import { draftTemplates, renderDraft } from "../../src/guidance/templates.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";
import { createProgram } from "../../src/cli.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function root() { const path = await mkdtemp(join(tmpdir(), "guide-test-")); roots.push(path); return path; }
function terminal(answers: string[], interactive = true) {
  const output: string[] = [];
  const io: GuideIO = { isInteractive: interactive, write: text => { output.push(text); }, ask: async () => {
    if (answers.length === 0) throw new Error("Unexpected extra prompt");
    const answer = answers.shift()!; if (answer === "<cancel>") throw new Error("GUIDE_CANCELLED"); return answer;
  } };
  return { io, output };
}
async function initialized() { const path = await root(); await initializeProject({root:path,id:"demo",name:"Demo",kind:"new-site"}); return path; }
const execute = async (_arguments: string[]) => { throw new Error("Unexpected explicit command"); };

it("keeps unanswered draft sections explicit without inventing answers", () => {
  const text = renderDraft("creative-brief", { Audience: "Local residents" });
  expect(text).toContain("Local residents");
  expect(text).toContain("[Unanswered]");
  expect(text).not.toContain("approved");
});
it("instructs noninteractive users without initializing a project", async () => {
  const path = await root(), { io, output } = terminal([], false);
  await runGuide(path, io, execute);
  expect(output.join("")).toContain("interactive terminal");
  await expect(access(join(path,".creative-preproduction/manifest.json"))).rejects.toThrow();
});
it("leaves unconfirmed initialization unsaved", async () => {
  const path = await root(), { io } = terminal(["demo", "Demo", "new-site", "n"]);
  await runGuide(path, io, execute);
  await expect(access(join(path,".creative-preproduction/manifest.json"))).rejects.toThrow();
});
it("creates an editable draft only after confirmation and never approves or advances", async () => {
  const path = await initialized();
  const fields = draftTemplates["creative-brief"].fields;
  const { io } = terminal(["draft", "creative-brief", "brief", ...fields.map(field => `Answer for ${field}`), "Draft from teammate answers", "y", "exit"]);
  await runGuide(path, io, execute);
  const manifest = await new ProjectStore(path).load();
  expect(manifest.stage).toBe("brief"); expect(manifest.approvals).toEqual([]);
  expect(manifest.artifacts[0]).toMatchObject({id:"brief",status:"draft",version:1});
  expect(await readFile(join(path,manifest.artifacts[0]!.path),"utf8")).toContain("Answer for Audience");
});
it("cancels an unconfirmed draft and resumes with saved records intact", async () => {
  const path = await initialized(), { io } = terminal(["draft", "creative-brief", "brief", "<cancel>"]);
  await runGuide(path, io, execute);
  expect((await new ProjectStore(path).load()).artifacts).toEqual([]);
  const resumed = terminal(["exit"]); await runGuide(path,resumed.io,execute);
  expect(resumed.output.join("")).toContain("Current stage: brief");
});
it("imports an existing document after confirmation", async () => {
  const path = await initialized(); await writeFile(join(path,"brief.md"),"# Existing brief");
  const { io } = terminal(["import", "imported-brief", "creative-brief", "brief.md", "Existing teammate document", "", "y", "exit"]);
  await runGuide(path,io,execute);
  expect((await new ProjectStore(path).load()).artifacts[0]).toMatchObject({id:"imported-brief",path:"brief.md",status:"draft"});
});

it("declines a draft without creating its file or record", async () => {
  const path = await initialized(), fields = draftTemplates["creative-brief"].fields;
  const { io } = terminal(["draft","creative-brief","brief",...fields.map(()=>""),"Draft exploration","n","exit"]);
  await runGuide(path,io,execute);
  expect((await new ProjectStore(path).load()).artifacts).toEqual([]);
  await expect(access(join(path,".creative-preproduction/artifacts/brief-v1.md"))).rejects.toThrow();
});

it("records a real review only as a separately confirmed action, without advancing", async () => {
  const path = await initialized(); await writeFile(join(path,"brief.md"),"# Brief for review");
  const run = async (args: string[]) => { await createProgram().exitOverride().parseAsync(["node","creative-preproduction",...args]); };
  const { io } = terminal(["import","brief","creative-brief","brief.md","Existing creative brief","","y",
    "submit","brief","1","y","review","brief","1","creative-lead","approved","Mina","","Explicitly reviewed this version","y","exit"]);
  await runGuide(path,io,run);
  const manifest = await new ProjectStore(path).load();
  expect(manifest.artifacts[0]?.status).toBe("approved");
  expect(manifest.approvals).toHaveLength(1);
  expect(manifest.approvals[0]?.reviewer).toBe("Mina");
  expect(manifest.stage).toBe("brief");
});

it("does not record an unconfirmed review decision", async () => {
  const path = await initialized(); await writeFile(join(path,"brief.md"),"# Brief");
  const run = async (args: string[]) => { await createProgram().exitOverride().parseAsync(["node","creative-preproduction",...args]); };
  const { io } = terminal(["import","brief","creative-brief","brief.md","Existing brief","","y",
    "review","brief","1","peer","approved","Mina","","Explicit decision","n","exit"]);
  await runGuide(path,io,run);
  expect((await new ProjectStore(path).load()).approvals).toEqual([]);
});
