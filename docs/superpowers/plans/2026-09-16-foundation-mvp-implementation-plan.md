# Creative Preproduction Harness Foundation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the agent-neutral, local foundation that initializes a website project's creative-preproduction workspace, persists its workflow state, versions its artifacts, records tiered approvals, and validates the project without assigning creative scores.

**Architecture:** A TypeScript command-line application owns schemas, state transitions, artifact lineage, and deterministic integrity checks. Human-readable Markdown and structured JSON live in the website repository; agent adapters and visual providers consume this foundation through exported interfaces in later plans.

**Tech Stack:** Node.js 22.12.0 or newer, TypeScript 7.0.2, Commander 15.0.0, Zod 4.6.5, Vitest 5.0.1, npm

**Spec:** `docs/superpowers/specs/2026-09-16-creative-preproduction-harness-design.md`

## Global Constraints

- The website repository is the canonical record for project-specific creative work.
- No numerical design score may be created, persisted, displayed, or used for workflow transitions.
- Approved artifact versions are immutable; revisions create a new version with an explicit rationale.
- New-site and existing-site intake paths must both be representable.
- Project files must remain human-readable without the CLI.
- The project manifest must record the harness schema version and harness release version.
- Missing references, licensing information, or approvals remain visibly unresolved; the system never fabricates them.
- A failed write must not leave a partially written manifest or artifact index.
- This plan does not implement agent coaching adapters, HTML/SVG generation, Figma integration, or the optional dashboard. Those are separate, independently testable plans built on the interfaces defined here.

## Planned file structure

```text
package.json                         Package metadata, scripts, dependency pins, and CLI binary
tsconfig.json                        Strict TypeScript compiler configuration
vitest.config.ts                     Test discovery and coverage configuration
src/cli.ts                           Commander entry point and command registration
src/domain/schema.ts                 Zod schemas and inferred domain types
src/domain/workflow.ts               Legal stages, transitions, and readiness rules
src/storage/project-store.ts         Atomic filesystem reads and writes
src/services/initializer.ts          New-project workspace creation
src/services/artifacts.ts            Artifact creation, versioning, and approval behavior
src/services/validation.ts           Deterministic project integrity validation
src/commands/init.ts                 `creative-preproduction init`
src/commands/status.ts               `creative-preproduction status`
src/commands/validate.ts             `creative-preproduction validate`
templates/brief.md                   Initial interpreted-brief template
templates/decision-journal.md        Initial decision journal
templates/research-board.md          Initial research board
tests/cli/help.test.ts               CLI smoke test
tests/domain/schema.test.ts          Schema acceptance and rejection tests
tests/domain/workflow.test.ts        Transition and gate tests
tests/services/initializer.test.ts   Workspace creation tests
tests/services/artifacts.test.ts     Versioning and approval tests
tests/services/validation.test.ts    Integrity diagnostic tests
tests/e2e/foundation-flow.test.ts    Representative local workflow
README.md                            Installation, commands, project format, and boundaries
```

---

### Task 1: Establish the typed CLI shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli.ts`
- Create: `tests/cli/help.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `createProgram(): Command` and the `creative-preproduction` executable

- [ ] **Step 1: Write the failing CLI help test**

```ts
// tests/cli/help.test.ts
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli.js";

describe("CLI help", () => {
  it("identifies the harness without promising creative scores", () => {
    const help = createProgram().helpInformation();
    expect(help).toContain("creative preproduction");
    expect(help.toLowerCase()).not.toContain("score");
  });
});
```

- [ ] **Step 2: Add the package and compiler configuration**

```json
{
  "name": "creative-preproduction-harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "bin": { "creative-preproduction": "dist/src/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "commander": "15.0.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "7.0.2",
    "vitest": "5.0.1"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 3: Install dependencies and verify the test fails for the missing CLI module**

Run: `npm install`

Run: `npm test -- tests/cli/help.test.ts`

Expected: FAIL because `src/cli.ts` does not exist.

- [ ] **Step 4: Implement the minimal CLI program**

```ts
// src/cli.ts
#!/usr/bin/env node
import { Command } from "commander";

export function createProgram(): Command {
  return new Command()
    .name("creative-preproduction")
    .description("Guide and preserve creative preproduction for website projects")
    .version("0.1.0");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createProgram().parseAsync(process.argv);
}
```

- [ ] **Step 5: Verify the CLI shell**

Run: `npm test -- tests/cli/help.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit the CLI shell**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/cli.ts tests/cli/help.test.ts
git commit -m "feat: establish typed cli shell"
```

---

### Task 2: Define the agent-neutral project schema

**Files:**
- Create: `src/domain/schema.ts`
- Create: `tests/domain/schema.test.ts`

**Interfaces:**
- Consumes: Zod
- Produces: `ProjectManifestSchema`, `ArtifactRecordSchema`, `ApprovalRecordSchema`, `ReferenceRecordSchema`, and their inferred TypeScript types

- [ ] **Step 1: Write schema behavior tests**

```ts
// tests/domain/schema.test.ts
import { describe, expect, it } from "vitest";
import { ProjectManifestSchema } from "../../src/domain/schema.js";

const validManifest = {
  schemaVersion: 1,
  harnessVersion: "0.1.0",
  project: { id: "museum-redesign", name: "Museum redesign", kind: "existing-site" },
  stage: "brief",
  artifacts: [],
  approvals: [],
  unresolvedQuestions: ["Which collection should lead the home page?"],
  createdAt: "2026-09-16T18:00:00.000Z",
  updatedAt: "2026-09-16T18:00:00.000Z"
};

describe("ProjectManifestSchema", () => {
  it("accepts a human-review workflow manifest", () => {
    expect(ProjectManifestSchema.parse(validManifest).project.kind).toBe("existing-site");
  });

  it("rejects score-shaped fields at every depth", () => {
    expect(() => ProjectManifestSchema.parse({ ...validManifest, designScore: 92 })).toThrow();
  });

  it("requires a non-empty reason for conditional approval", () => {
    expect(() => ProjectManifestSchema.parse({
      ...validManifest,
      approvals: [{
        id: "approval-1",
        artifactId: "territory-1",
        artifactVersion: 1,
        tier: "peer",
        decision: "approved-with-conditions",
        reviewer: "Taylor",
        reason: "",
        createdAt: validManifest.createdAt
      }]
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the schema tests and confirm failure**

Run: `npm test -- tests/domain/schema.test.ts`

Expected: FAIL because `src/domain/schema.ts` does not exist.

- [ ] **Step 3: Implement strict schemas and inferred types**

```ts
// src/domain/schema.ts
import { z } from "zod";

const IsoDate = z.string().datetime({ offset: true });

export const ProjectKindSchema = z.enum(["new-site", "existing-site"]);
export const StageSchema = z.enum([
  "brief", "research", "territories", "visual-language", "exploration", "review", "handoff"
]);
export const ArtifactKindSchema = z.enum([
  "creative-brief", "existing-site-audit", "identity-thesis", "research-board",
  "creative-territory", "visual-language", "composition-study", "decision-journal",
  "implementation-handoff"
]);

export const ReferenceRecordSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  relevance: z.string().min(1),
  lesson: z.string().min(1),
  avoidCopying: z.string().min(1),
  attribution: z.string().min(1),
  licenseStatus: z.enum(["verified", "unknown", "not-applicable"]),
  licenseNotes: z.string().min(1)
}).strict();

export const ArtifactRecordSchema = z.object({
  id: z.string().min(1),
  kind: ArtifactKindSchema,
  version: z.number().int().positive(),
  path: z.string().min(1),
  status: z.enum(["draft", "in-review", "approved", "superseded"]),
  rationale: z.string().min(1),
  parentVersion: z.number().int().positive().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const ApprovalRecordSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  artifactVersion: z.number().int().positive(),
  tier: z.enum(["self", "peer", "creative-lead", "stakeholder"]),
  decision: z.enum(["approved", "approved-with-conditions", "returned"]),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
  createdAt: IsoDate
}).strict();

export const ProjectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  harnessVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: ProjectKindSchema
  }).strict(),
  stage: StageSchema,
  artifacts: z.array(ArtifactRecordSchema),
  approvals: z.array(ApprovalRecordSchema),
  references: z.array(ReferenceRecordSchema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type ReferenceRecord = z.infer<typeof ReferenceRecordSchema>;
export type Stage = z.infer<typeof StageSchema>;
```

- [ ] **Step 4: Verify schema behavior and typing**

Run: `npm test -- tests/domain/schema.test.ts`

Expected: 3 tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the domain schema**

```bash
git add src/domain/schema.ts tests/domain/schema.test.ts
git commit -m "feat: define project manifest schema"
```

---

### Task 3: Initialize a project-local preproduction workspace

**Files:**
- Create: `src/services/initializer.ts`
- Create: `src/commands/init.ts`
- Modify: `src/cli.ts`
- Create: `templates/brief.md`
- Create: `templates/decision-journal.md`
- Create: `templates/research-board.md`
- Create: `tests/services/initializer.test.ts`

**Interfaces:**
- Consumes: `ProjectManifestSchema`
- Produces: `initializeProject(options: InitOptions): Promise<ProjectManifest>` and registered `init` command

- [ ] **Step 1: Write the initializer tests**

```ts
// tests/services/initializer.test.ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeProject } from "../../src/services/initializer.js";

describe("initializeProject", () => {
  it("creates a readable new-site workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    const manifest = await initializeProject({ root, id: "civic-arts", name: "Civic Arts", kind: "new-site", now: new Date("2026-09-16T18:00:00Z") });
    expect(manifest.stage).toBe("brief");
    expect(await readFile(join(root, ".creative-preproduction", "brief.md"), "utf8")).toContain("Audience");
  });

  it("includes an audit section for an existing site", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    await initializeProject({ root, id: "civic-arts", name: "Civic Arts", kind: "existing-site", now: new Date("2026-09-16T18:00:00Z") });
    expect(await readFile(join(root, ".creative-preproduction", "existing-site-audit.md"), "utf8")).toContain("Preserved strengths");
  });
});
```

- [ ] **Step 2: Run the initializer tests and confirm failure**

Run: `npm test -- tests/services/initializer.test.ts`

Expected: FAIL because `initializeProject` is missing.

- [ ] **Step 3: Create explicit starter templates**

```md
<!-- templates/brief.md -->
# Interpreted Creative Brief

## Audience

## Purpose and desired action

## Desired feeling

## Content priorities

## Brand and stakeholder constraints

## Technical and accessibility constraints

## Evidence of success
```

```md
<!-- templates/decision-journal.md -->
# Decision Journal

Record the date, question, alternatives considered, decision, rationale, reviewer feedback, and resulting action for every consequential change.
```

```md
<!-- templates/research-board.md -->
# Research Board

Each reference must state the question it answers, the relevant lesson, what must not be copied, its source and attribution, and its known license status.
```

- [ ] **Step 4: Implement deterministic workspace creation**

Implement `initializeProject` to create `.creative-preproduction/manifest.json`, copy the three templates, conditionally create `existing-site-audit.md` with headings for preserved strengths, hierarchy, composition, consistency, responsiveness, usability, accessibility, content flow, and identity opportunities, and reject initialization when `.creative-preproduction/manifest.json` already exists.

Use this exact public interface:

```ts
export interface InitOptions {
  root: string;
  id: string;
  name: string;
  kind: "new-site" | "existing-site";
  now?: Date;
}

export async function initializeProject(options: InitOptions): Promise<ProjectManifest>;
```

Write JSON using a temporary sibling file followed by `rename` so interruption cannot leave a partial manifest.

- [ ] **Step 5: Register the init command**

```ts
// src/commands/init.ts
import type { Command } from "commander";
import { resolve } from "node:path";
import { initializeProject } from "../services/initializer.js";

export function registerInitCommand(program: Command): void {
  program.command("init")
    .requiredOption("--id <slug>")
    .requiredOption("--name <name>")
    .requiredOption("--kind <kind>", "new-site or existing-site")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const manifest = await initializeProject({
        root: resolve(options.root), id: options.id, name: options.name, kind: options.kind
      });
      process.stdout.write(`Initialized ${manifest.project.name} at stage ${manifest.stage}\n`);
    });
}
```

Call `registerInitCommand(program)` inside `createProgram` before returning the program.

- [ ] **Step 6: Verify both intake paths**

Run: `npm test -- tests/services/initializer.test.ts`

Expected: 2 tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit initialization support**

```bash
git add src/cli.ts src/commands/init.ts src/services/initializer.ts templates tests/services/initializer.test.ts
git commit -m "feat: initialize creative project workspace"
```

---

### Task 4: Persist state and enforce workflow transitions

**Files:**
- Create: `src/storage/project-store.ts`
- Create: `src/domain/workflow.ts`
- Create: `src/commands/status.ts`
- Modify: `src/cli.ts`
- Create: `tests/domain/workflow.test.ts`

**Interfaces:**
- Consumes: `ProjectManifestSchema`, `.creative-preproduction/manifest.json`
- Produces: `ProjectStore`, `canTransition(manifest, target): TransitionResult`, `transitionProject(store, target, now): Promise<ProjectManifest>`

- [ ] **Step 1: Write transition tests for evidence-based gates**

```ts
// tests/domain/workflow.test.ts
import { describe, expect, it } from "vitest";
import { canTransition } from "../../src/domain/workflow.js";
import type { ProjectManifest } from "../../src/domain/schema.js";

const base = {
  schemaVersion: 1,
  harnessVersion: "0.1.0",
  project: { id: "museum", name: "Museum", kind: "new-site" },
  stage: "brief",
  artifacts: [], approvals: [], references: [], unresolvedQuestions: [],
  createdAt: "2026-09-16T18:00:00.000Z", updatedAt: "2026-09-16T18:00:00.000Z"
} satisfies ProjectManifest;

describe("canTransition", () => {
  it("requires an approved creative brief before research", () => {
    expect(canTransition(base, "research")).toEqual({ allowed: false, reasons: ["An approved creative-brief artifact is required."] });
  });

  it("allows returning to an earlier stage without destroying history", () => {
    expect(canTransition({ ...base, stage: "visual-language" }, "research")).toEqual({ allowed: true, reasons: [] });
  });
});
```

- [ ] **Step 2: Run the workflow test and confirm failure**

Run: `npm test -- tests/domain/workflow.test.ts`

Expected: FAIL because the workflow module does not exist.

- [ ] **Step 3: Implement atomic project storage**

Create `ProjectStore` with this interface:

```ts
export class ProjectStore {
  constructor(readonly root: string) {}
  async load(): Promise<ProjectManifest>;
  async save(manifest: ProjectManifest): Promise<void>;
}
```

`load` reads `.creative-preproduction/manifest.json` and parses it with `ProjectManifestSchema`. `save` validates before writing, writes formatted JSON to `manifest.json.tmp`, then renames it to `manifest.json`.

- [ ] **Step 4: Implement explicit transition requirements**

Create a `TransitionResult` union and enforce these forward gates:

```ts
export type TransitionResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

export function canTransition(manifest: ProjectManifest, target: Stage): TransitionResult;
export async function transitionProject(store: ProjectStore, target: Stage, now?: Date): Promise<ProjectManifest>;
```

- `brief → research`: an approved `creative-brief` artifact is required.
- `research → territories`: an approved `research-board` and at least one reference are required.
- `territories → visual-language`: at least two `creative-territory` artifacts must exist and one must be approved.
- `visual-language → exploration`: an approved `visual-language` artifact is required.
- `exploration → review`: at least one `composition-study` in review or approved is required.
- `review → handoff`: an approved `implementation-handoff` and the tier required by the project kind are required; `new-site` requires `creative-lead` or `stakeholder`, while `existing-site` requires at least `peer`.
- Any transition to an earlier stage is allowed and preserves all artifacts and approvals.
- Skipping forward over stages is rejected.

- [ ] **Step 5: Add a readable status command**

`registerStatusCommand(program)` loads the manifest and prints project name, kind, current stage, artifact count, unresolved questions, and the next stage's unmet transition reasons. It must not print a score, percentage, or grade.

- [ ] **Step 6: Verify workflow and status behavior**

Run: `npm test -- tests/domain/workflow.test.ts`

Expected: all transition tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit persistence and workflow rules**

```bash
git add src/storage/project-store.ts src/domain/workflow.ts src/commands/status.ts src/cli.ts tests/domain/workflow.test.ts
git commit -m "feat: persist project workflow state"
```

---

### Task 5: Version artifacts and preserve human approval

**Files:**
- Create: `src/services/artifacts.ts`
- Create: `tests/services/artifacts.test.ts`

**Interfaces:**
- Consumes: `ProjectStore`, `ArtifactRecord`, `ApprovalRecord`
- Produces: `createArtifact`, `reviseArtifact`, and `recordApproval`

- [ ] **Step 1: Write tests for immutable approval and explicit revision**

```ts
// tests/services/artifacts.test.ts
import { describe, expect, it } from "vitest";
import { reviseArtifact } from "../../src/services/artifacts.js";

describe("artifact revision", () => {
  it("creates a new version instead of overwriting an approved artifact", () => {
    const approved = {
      id: "identity", kind: "identity-thesis", version: 1, path: "identity-thesis-v1.md",
      status: "approved", rationale: "Connects archival history with living culture.",
      createdAt: "2026-09-16T18:00:00.000Z", updatedAt: "2026-09-16T18:00:00.000Z"
    } as const;
    const revised = reviseArtifact(approved, {
      path: "identity-thesis-v2.md",
      rationale: "Strengthen the contrast between archive and participation.",
      now: new Date("2026-09-17T18:00:00Z")
    });
    expect(revised).toMatchObject({ id: "identity", version: 2, parentVersion: 1, status: "draft" });
    expect(approved.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run the artifact test and confirm failure**

Run: `npm test -- tests/services/artifacts.test.ts`

Expected: FAIL because the artifact service does not exist.

- [ ] **Step 3: Implement artifact construction and revision**

```ts
export interface CreateArtifactInput {
  id: string;
  kind: ArtifactRecord["kind"];
  path: string;
  rationale: string;
  now?: Date;
}

export interface ReviseArtifactInput {
  path: string;
  rationale: string;
  now?: Date;
}

export function createArtifact(input: CreateArtifactInput): ArtifactRecord;
export function reviseArtifact(current: ArtifactRecord, input: ReviseArtifactInput): ArtifactRecord;
```

`createArtifact` starts at version 1 and draft status. `reviseArtifact` returns a new draft with `version + 1`, `parentVersion` set to the prior version, and a non-empty rationale. Neither function mutates its input.

- [ ] **Step 4: Implement approval recording**

```ts
export interface RecordApprovalInput {
  artifact: ArtifactRecord;
  tier: ApprovalRecord["tier"];
  decision: ApprovalRecord["decision"];
  reviewer: string;
  reason: string;
  now?: Date;
}

export function recordApproval(input: RecordApprovalInput): {
  artifact: ArtifactRecord;
  approval: ApprovalRecord;
};
```

For `approved`, return a copied artifact with approved status. For `approved-with-conditions`, return in-review status so the conditions remain active. For `returned`, return draft status. Every decision requires a named reviewer and non-empty reason.

- [ ] **Step 5: Verify artifact and approval rules**

Run: `npm test -- tests/services/artifacts.test.ts`

Expected: all artifact tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit artifact lineage and approvals**

```bash
git add src/services/artifacts.ts tests/services/artifacts.test.ts
git commit -m "feat: preserve artifact lineage and approval"
```

---

### Task 6: Validate project integrity without judging taste

**Files:**
- Create: `src/services/validation.ts`
- Create: `src/commands/validate.ts`
- Modify: `src/cli.ts`
- Create: `tests/services/validation.test.ts`

**Interfaces:**
- Consumes: `ProjectManifest`, local workspace paths
- Produces: `validateProject(root, manifest): Promise<Diagnostic[]>` and registered `validate` command

- [ ] **Step 1: Write deterministic diagnostic tests**

```ts
// tests/services/validation.test.ts
import { describe, expect, it } from "vitest";
import { validateProject } from "../../src/services/validation.js";

describe("validateProject", () => {
  it("reports unknown licensing and missing local artifact files", async () => {
    const manifest = {
      schemaVersion: 1, harnessVersion: "0.1.0",
      project: { id: "museum", name: "Museum", kind: "new-site" }, stage: "research",
      artifacts: [{ id: "brief", kind: "creative-brief", version: 1, path: "missing.md", status: "approved", rationale: "Confirmed with the team.", createdAt: "2026-09-16T18:00:00.000Z", updatedAt: "2026-09-16T18:00:00.000Z" }],
      approvals: [],
      references: [{ id: "ref-1", url: "https://example.com", title: "Example", relevance: "Editorial pacing", lesson: "Vary section density", avoidCopying: "Do not reproduce the grid", attribution: "Example Studio", licenseStatus: "unknown", licenseNotes: "Usage rights have not been verified" }],
      unresolvedQuestions: [], createdAt: "2026-09-16T18:00:00.000Z", updatedAt: "2026-09-16T18:00:00.000Z"
    } as const;
    const diagnostics = await validateProject("C:/definitely-not-a-project", manifest);
    expect(diagnostics.map((item) => item.code)).toEqual(["artifact-file-missing", "reference-license-unknown"]);
  });
});
```

- [ ] **Step 2: Run the validation test and confirm failure**

Run: `npm test -- tests/services/validation.test.ts`

Expected: FAIL because the validation service does not exist.

- [ ] **Step 3: Implement stable diagnostic output**

```ts
export interface Diagnostic {
  code: "artifact-file-missing" | "reference-license-unknown" | "approval-artifact-missing" | "approval-version-missing" | "duplicate-artifact-version";
  severity: "error" | "warning";
  message: string;
  subjectId: string;
}

export async function validateProject(root: string, manifest: ProjectManifest): Promise<Diagnostic[]>;
```

Return diagnostics sorted by `code`, then `subjectId`. Treat missing files, approvals targeting absent artifacts, approvals targeting absent versions, and duplicate `(artifact id, version)` pairs as errors. Treat unknown reference licensing as a warning. Do not inspect visual taste or generate scores.

- [ ] **Step 4: Register the validation command**

`registerValidateCommand(program)` loads the project, prints one line per diagnostic as `SEVERITY code subjectId: message`, and sets `process.exitCode = 1` only when at least one error exists.

- [ ] **Step 5: Verify deterministic validation**

Run: `npm test -- tests/services/validation.test.ts`

Expected: all validation tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit integrity validation**

```bash
git add src/services/validation.ts src/commands/validate.ts src/cli.ts tests/services/validation.test.ts
git commit -m "feat: validate creative project integrity"
```

---

### Task 7: Prove the foundation through an end-to-end scenario

**Files:**
- Create: `tests/e2e/foundation-flow.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: CLI, initializer, project store, workflow, artifact service, validation service
- Produces: an executable proof of the foundation contract and contributor-facing documentation

- [ ] **Step 1: Write the end-to-end test**

Create `tests/e2e/foundation-flow.test.ts` that:

1. Creates a temporary existing-site project.
2. Confirms the audit template exists.
3. Creates and persists a creative brief artifact.
4. Records peer approval with a rationale.
5. Transitions from `brief` to `research`.
6. Reloads the manifest from disk.
7. Runs validation and confirms no error diagnostics.
8. Revises the approved brief and confirms both versions remain in the manifest while the new version is draft.

Use only exported public interfaces from earlier tasks; do not reach into private helpers.

- [ ] **Step 2: Run the end-to-end test and fix only integration defects**

Run: `npm test -- tests/e2e/foundation-flow.test.ts`

Expected: PASS with the persisted stage equal to `research`, two brief versions, and no error diagnostics.

- [ ] **Step 3: Document the foundation's actual commands and boundaries**

Write `README.md` with:

- Purpose and the coach/collaborator/maker model
- Explicit statement that the foundation records evidence and approval but never produces creative scores
- Node requirement and `npm install`, `npm run build`, and `npm test`
- `init`, `status`, and `validate` examples
- The `.creative-preproduction` directory format
- New-site and existing-site initialization examples
- Artifact immutability and revision behavior
- Tiered human approval behavior
- The boundary that agent adapters, coaching content, HTML/SVG, Figma, and the dashboard are separate follow-on components

- [ ] **Step 4: Run the full verification suite**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0 and `dist/src/cli.js` exists.

- [ ] **Step 5: Confirm the repository is clean after committing**

```bash
git add README.md tests/e2e/foundation-flow.test.ts
git commit -m "test: prove foundation workflow end to end"
git status --short
```

Expected: the final command prints no changed files.

## Follow-on implementation plans

After this foundation passes its end-to-end test, create separate plans in this order:

1. Adaptive coaching content and Codex/Claude adapter conformance.
2. HTML/SVG creative-provider contract and composition-study generation.
3. Figma provider for moodboards and editable composition studies.
4. Full example projects and backend-developer usability trials.
5. Optional local dashboard.
6. Versioned packaging, project migration, additional agent adapters, and Affinity integration when a viable tool interface exists.
