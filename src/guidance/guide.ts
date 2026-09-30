import { access, lstat, mkdir, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ArtifactKindSchema, type ProjectManifest } from "../domain/schema.js";
import { canTransition, stages } from "../domain/workflow.js";
import { initializeProject } from "../services/initializer.js";
import { addProjectArtifact } from "../services/workflow-actions.js";
import { ProjectStore } from "../storage/project-store.js";
import { commandActions, type GuideField } from "./command-actions.js";
import { draftTemplates, renderDraft, type DraftKind } from "./templates.js";

export interface GuideIO {
  isInteractive: boolean;
  ask(prompt: string): Promise<string>;
  write(text: string): void;
}
export type ExecuteGuideCommand = (arguments_: string[]) => Promise<void>;
export class GuideCancelledError extends Error { constructor() { super("GUIDE_CANCELLED"); } }

async function answer(io: GuideIO, prompt: string): Promise<string> {
  const value = (await io.ask(prompt)).trim();
  if (value === ":cancel" || value === ":quit") throw new GuideCancelledError();
  return value;
}
async function required(io: GuideIO, prompt: string): Promise<string> {
  for (;;) { const value = await answer(io, `${prompt}: `); if (value) return value; io.write("A value is required. Type :cancel to stop.\n"); }
}
async function choose(io: GuideIO, prompt: string, choices: readonly string[], defaultValue?: string): Promise<string> {
  for (;;) {
    const value = await answer(io, `${prompt} (${choices.join(" / ")})${defaultValue ? ` [${defaultValue}]` : ""}: `);
    if (value === "" && defaultValue) return defaultValue;
    if (choices.includes(value)) return value;
    io.write(`Choose one of: ${choices.join(", ")}.\n`);
  }
}
async function confirm(io: GuideIO, label: string, summary: Record<string, unknown>): Promise<boolean> {
  io.write(`\n${label}\n${Object.entries(summary).map(([key,value]) => `${key}: ${Array.isArray(value) ? value.join(", ") || "None" : String(value)}`).join("\n")}\n`);
  return /^(y|yes)$/i.test(await answer(io, "Save this action? [y/N]: "));
}

async function initialize(root: string, io: GuideIO): Promise<boolean> {
  const id = await required(io,"Project ID (lowercase slug)");
  const name = await required(io,"Project name");
  const kind = await choose(io,"Project kind",["new-site","existing-site"],"new-site") as "new-site" | "existing-site";
  if (!await confirm(io,"Initialize project",{root,id,name,kind})) return false;
  await initializeProject({root,id,name,kind});
  io.write("Project saved. Add participants and assign decision owners from the menu.\n");
  return true;
}

function suggestedKind(manifest: ProjectManifest): DraftKind {
  const kinds: Record<ProjectManifest["stage"], DraftKind> = {
    brief:"creative-brief",research:"research-board",territories:"creative-territory",
    "visual-language":"visual-language",exploration:"decision-journal",review:"implementation-handoff",handoff:"decision-journal"
  };
  return kinds[manifest.stage];
}

async function draft(root: string, store: ProjectStore, manifest: ProjectManifest, io: GuideIO): Promise<void> {
  const kind = await choose(io,"Document kind",Object.keys(draftTemplates),suggestedKind(manifest)) as DraftKind;
  const id = await required(io,"Artifact ID (lowercase slug)");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Artifact ID must be a lowercase slug such as creative-brief.");
  const answers: Record<string,string> = {};
  io.write("Supply your own answers. Blank sections are marked [Unanswered].\n");
  for (const field of draftTemplates[kind].fields) answers[field] = await answer(io,`${field}: `);
  const rationale = await required(io,"Why this draft is being recorded");
  const path = `.creative-preproduction/artifacts/${id}-v1.md`;
  const contents = renderDraft(kind,answers);
  io.write(`\n${contents}\n`);
  if (!await confirm(io,"Save draft (no approval)",{id,kind,path,rationale})) return;
  if (manifest.artifacts.some(artifact => artifact.id === id)) throw new Error(`Artifact ${id} already exists; use Revise document with a new file.`);
  const canonicalRoot = await realpath(root);
  // Build one directory at a time rather than following an existing linked parent.
  let parent = canonicalRoot;
  for (const segment of [".creative-preproduction","artifacts"]) {
    parent = join(parent,segment);
    try {
      const info = await lstat(parent);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Draft directory must be a real directory: ${parent}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(parent);
    }
  }
  const file = await open(join(parent,`${id}-v1.md`),"wx");
  try { await file.writeFile(contents,"utf8"); await file.sync(); } finally { await file.close(); }
  try { await addProjectArtifact(store,{id,kind,path,rationale}); }
  catch(error) { io.write(`The confirmed draft file is retained at ${path}, but registration failed. Fix the error and import that file.\n`); throw error; }
  io.write(`Saved draft ${id}. Editing or drafting does not record approval.\n`);
}

async function importDocument(store: ProjectStore, io: GuideIO): Promise<void> {
  const id = await required(io,"Artifact ID");
  const kind = await choose(io,"Artifact kind",ArtifactKindSchema.options) as typeof ArtifactKindSchema._output;
  const path = await required(io,"Existing project-relative file path");
  const rationale = await required(io,"Why this document is being recorded");
  const assetIds = (await answer(io,"Asset IDs (comma separated; blank for none): ")).split(",").map(id=>id.trim()).filter(Boolean);
  if (await confirm(io,"Register document as a draft",{id,kind,path,rationale,assetIds})) {
    await addProjectArtifact(store,{id,kind,path,rationale,assetIds}); io.write(`Registered draft ${id}.\n`);
  }
}

async function fieldValue(io: GuideIO, field: GuideField): Promise<string> {
  if (field.optional) {
    for (;;) {
      const value = await answer(io,`${field.label}: `);
      if (!value || !field.choices || field.choices.includes(value)) return value;
      io.write(`Choose ${field.choices.join(", ")}, or leave blank.\n`);
    }
  }
  if (field.choices) return choose(io,field.label,field.choices,field.defaultValue);
  if (field.defaultValue) return (await answer(io,`${field.label} [${field.defaultValue}]: `)) || field.defaultValue;
  return required(io,field.label);
}

async function explicitAction(key: string, root: string, io: GuideIO, execute: ExecuteGuideCommand, manifest: ProjectManifest): Promise<void> {
  const action = commandActions[key]!;
  const arguments_ = [...action.command,"--root",root];
  const summary: Record<string,unknown> = {};
  for (const originalField of action.fields) {
    const nextStage = stages[stages.indexOf(manifest.stage)+1];
    const field = key === "advance" && nextStage !== undefined ? {...originalField,defaultValue:nextStage} : originalField;
    const value = await fieldValue(io,field);
    summary[field.label] = value || "Unchanged / omitted";
    if (!value) continue;
    for (const item of field.multiple ? value.split(",").map(item=>item.trim()).filter(Boolean) : [value]) arguments_.push(field.flag,item);
  }
  if (key === "review") io.write("Record only a decision actually made by the named reviewer. This tool does not authenticate their identity.\n");
  if (!action.mutates || await confirm(io,action.label,summary)) await execute(arguments_);
}

export async function runGuide(projectRoot: string, io: GuideIO, execute: ExecuteGuideCommand): Promise<void> {
  if (!io.isInteractive) { io.write("Guide needs an interactive terminal. Run npm run cli -- --help for explicit commands.\n"); return; }
  const root = resolve(projectRoot), store = new ProjectStore(root);
  io.write("Creative preproduction guide. Everything stays local. Type :cancel at any prompt to stop.\n");
  try {
    try { await access(join(root,".creative-preproduction","manifest.json")); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; if (!await initialize(root,io)) return; }
    for (;;) {
      const manifest = await store.load();
      const next = stages[stages.indexOf(manifest.stage)+1];
      io.write(`\nProject: ${manifest.project.name}\nCurrent stage: ${manifest.stage}\nArtifacts: ${manifest.artifacts.length}; participants: ${manifest.participants.length}\n`);
      if (next) {
        const result = canTransition(manifest,next);
        io.write(result.allowed ? `Stage evidence is ready for an explicit advance to ${next}; file validation runs on advance.\n` : `Before ${next}:\n${result.reasons.map(reason=>`- ${reason}`).join("\n")}\n`);
      } else io.write("Handoff reached. Further changes still require explicit review.\n");
      const menu = [{key:"draft",label:"Draft document"},{key:"import",label:"Import existing document"},...Object.entries(commandActions).map(([key,action])=>({key,label:action.label})),{key:"exit",label:"Exit"}];
      io.write(menu.map((item,index)=>`${index+1}. ${item.label} (${item.key})`).join("\n")+"\n");
      const selection = await answer(io,"Choose an action (number or name): ");
      const item = menu.find(item=>item.key===selection || item.label.toLowerCase()===selection.toLowerCase()) ?? (/^\d+$/.test(selection) ? menu[Number(selection)-1] : undefined);
      if (!item) { io.write("Choose an action from the menu.\n"); continue; }
      if (item.key === "exit") return;
      try {
        if (item.key === "draft") await draft(root,store,manifest,io);
        else if (item.key === "import") await importDocument(store,io);
        else await explicitAction(item.key,root,io,execute,manifest);
      } catch(error) {
        if (error instanceof GuideCancelledError || (error as Error).message === "GUIDE_CANCELLED") throw error;
        io.write(`Action was not completed: ${(error as Error).message}\n`);
      }
    }
  } catch(error) {
    if (error instanceof GuideCancelledError || (error as Error).message === "GUIDE_CANCELLED" || (error as Error).name === "AbortError") { io.write("Cancelled. Previously saved actions are preserved; the unconfirmed action was not saved.\n"); return; }
    throw error;
  }
}
