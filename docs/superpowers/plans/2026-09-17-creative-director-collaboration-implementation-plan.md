# Creative-Director Collaboration Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the foundation harness into a local, agent-neutral creative-direction workflow that manages people, supplied assets, ordinary-message feedback, private provisional HTML/SVG studies, explicit decision authority, and safe promotion into implementation handoff.

**Architecture:** Evolve the manifest to schema version 2 while preserving an explicit migration path from version 1. Add small domain services for participants, assets, feedback, provisional work, and policy; keep providers replaceable; expose the core through focused CLI commands and Codex/Claude prompt adapters. Unknown-rights content remains inside a git-ignored private workspace and cannot satisfy approval or handoff gates.

**Tech Stack:** Node.js 22.12+, TypeScript 7, Zod 4, Commander 15, Vitest 5, Node built-in filesystem/path/crypto modules, HTML/CSS/SVG with no browser framework.

**Spec:** `docs/superpowers/specs/2026-09-17-creative-director-collaboration-design.md`

## Global Constraints

- Preserve the existing local-first manifest, immutable approved-artifact history, atomic writes, and exclusive write lock.
- Produce no design score, percentage, grade, or automated judgment of taste.
- Formal approval must be an explicit action tied to an exact artifact ID and version; imported feedback never creates approval.
- `unknown` rights permit only private local HTML/SVG exploration and block cloud providers, promotion, handoff, and publication.
- `restricted` rights follow explicit recorded provider scopes; absent permission means external-provider use is blocked.
- Provisional artifacts cannot be approved directly or satisfy workflow gates.
- Promotion creates a new draft version with lineage and never mutates the provisional source.
- Private files live under `.creative-preproduction/private/`, use generated identifiers, and are excluded from version control.
- Preserve imported feedback verbatim; derived classifications and interpretations remain visibly separate.
- Add no runtime dependencies; use the existing packages and Node built-ins.
- All public TypeScript remains strict under `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Every task follows test-driven development and ends in an independently reviewable commit.

---

## Planned file structure

```text
src/
├── adapters/
│   ├── types.ts                 # Host-neutral adapter request/result contract
│   ├── shared.ts                # Shared creative-direction instructions
│   ├── codex.ts                 # Codex-formatted context
│   └── claude.ts                # Claude-formatted context
├── commands/
│   ├── migrate.ts               # Explicit v1 → v2 migration
│   ├── participants.ts          # People and decision-owner commands
│   ├── assets.ts                # Supplied-asset registration/listing
│   ├── feedback.ts              # Verbatim feedback import/listing
│   ├── questions.ts             # Relay packet output
│   ├── explore-private.ts       # Private HTML/SVG study creation
│   ├── promote.ts               # Provisional → draft promotion
│   └── review.ts                # Explicit review decision recording
├── creative-direction/
│   ├── coordinator.ts           # Posture and next-action selection
│   └── questions.ts             # Deterministic question packets
├── domain/
│   ├── schema.ts                # v1 compatibility schema and v2 canonical schema
│   ├── migration.ts             # Pure v1 → v2 migration
│   ├── policy.ts                # Rights, provider, authority, and handoff policy
│   └── workflow.ts              # Existing stage gates plus policy reasons
├── providers/
│   └── html-svg.ts              # Local provisional study renderer
├── services/
│   ├── participants.ts          # Participant and decision-owner changes
│   ├── assets.ts                # Asset registration and policy updates
│   ├── asset-dossier.ts         # Human-readable supplied-asset projection
│   ├── feedback.ts              # Feedback construction and resolution
│   ├── provisional.ts           # Provisional artifact and promotion behavior
│   ├── artifacts.ts             # Existing artifacts plus explicit review protection
│   ├── initializer.ts           # v2 manifest and private workspace initialization
│   └── validation.ts            # Existing and extension diagnostics
└── storage/
    ├── project-store.ts         # v2 load, v1 inspect, explicit migration
    └── private-workspace.ts     # Opaque private references and safe file layout

tests/
├── adapters/conformance.test.ts
├── creative-direction/coordinator.test.ts
├── domain/migration.test.ts
├── domain/policy.test.ts
├── services/assets.test.ts
├── services/feedback.test.ts
├── services/provisional.test.ts
├── storage/private-workspace.test.ts
└── e2e/creative-director-flow.test.ts
```

Existing files not named above should change only when required by a public type, command registration, documentation, or regression test.

---

### Task 1: Manifest version 2 and explicit migration

**Files:**
- Modify: `src/domain/schema.ts`
- Create: `src/domain/migration.ts`
- Modify: `src/storage/project-store.ts`
- Modify: `src/services/initializer.ts`
- Modify: `src/services/artifacts.ts`
- Create: `src/services/package-info.ts`
- Create: `src/commands/migrate.ts`
- Modify: `src/cli.ts`
- Modify: `tests/domain/schema.test.ts`
- Create: `tests/domain/migration.test.ts`
- Modify: `tests/domain/workflow.test.ts`
- Modify: `tests/services/artifacts.test.ts`
- Modify: `tests/services/initializer.test.ts`
- Modify: `tests/services/validation.test.ts`
- Modify: `tests/storage/project-store.test.ts`
- Modify: `tests/e2e/foundation-flow.test.ts`

**Interfaces:**
- Consumes: current schema-version-1 JSON and atomic manifest storage
- Produces: `ProjectManifestV1Schema`, canonical schema-version-2 `ProjectManifestSchema`, `migrateManifest`, `ProjectStore.inspect`, `ProjectStore.migrate`, and the `migrate` command

- [ ] **Step 1: Write failing schema-version-2 tests**

Add tests proving that a version-2 manifest accepts empty participant, decision-owner, asset, and feedback collections; rejects score-shaped fields; and accepts `provisional` only as a valid artifact status. Use this shared fixture:

```ts
const validV2Manifest = {
  schemaVersion: 2,
  harnessVersion: "0.2.0",
  project: { id: "museum-redesign", name: "Museum redesign", kind: "existing-site" },
  stage: "brief",
  participants: [],
  decisionOwners: [],
  artifacts: [],
  approvals: [],
  assets: [],
  feedback: [],
  references: [],
  unresolvedQuestions: [],
  createdAt: "2026-09-17T18:00:00.000Z",
  updatedAt: "2026-09-17T18:00:00.000Z"
};
```

- [ ] **Step 2: Run the schema tests and confirm the version mismatch**

Run: `npm test -- tests/domain/schema.test.ts`

Expected: FAIL because the current canonical schema accepts only `schemaVersion: 1` and does not define the new collections or `provisional`.

- [ ] **Step 3: Define explicit v1 compatibility and v2 canonical schemas**

Keep the present shapes as exported compatibility schemas and add these public v2 types in `src/domain/schema.ts`:

```ts
export const ParticipantRoleSchema = z.enum([
  "creative-lead", "stakeholder", "developer", "peer"
]);

export const DecisionAreaSchema = z.enum([
  "creative-direction", "business-direction", "implementation-readiness"
]);

export const ArtifactStatusSchema = z.enum([
  "provisional", "draft", "in-review", "approved", "superseded"
]);

export const ArtifactVisibilitySchema = z.enum(["private", "project"]);

const LegacyArtifactRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "creative-brief", "existing-site-audit", "identity-thesis", "research-board",
    "creative-territory", "visual-language", "composition-study", "decision-journal",
    "implementation-handoff"
  ]),
  version: z.number().int().positive(),
  path: z.string().min(1),
  status: z.enum(["draft", "in-review", "approved", "superseded"]),
  rationale: z.string().min(1),
  parentVersion: z.number().int().positive().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

const LegacyApprovalRecordSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  artifactVersion: z.number().int().positive(),
  tier: z.enum(["self", "peer", "creative-lead", "stakeholder"]),
  decision: z.enum(["approved", "approved-with-conditions", "returned"]),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
  createdAt: IsoDate
}).strict();

export const ProjectManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  harnessVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: ProjectKindSchema
  }).strict(),
  stage: StageSchema,
  artifacts: z.array(LegacyArtifactRecordSchema),
  approvals: z.array(LegacyApprovalRecordSchema),
  references: z.array(ReferenceRecordSchema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const ParticipantRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  role: ParticipantRoleSchema,
  createdAt: IsoDate
}).strict();

export const DecisionOwnerRecordSchema = z.object({
  area: DecisionAreaSchema,
  participantId: z.string().min(1)
}).strict();

export const AssetStorageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("managed"), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("private"), ref: z.string().regex(/^[a-z0-9-]+$/) }).strict()
]);

export const AssetRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  creator: z.string().min(1).optional(),
  source: z.string().min(1),
  creativeOwner: z.string().min(1).optional(),
  intendedRole: z.string().min(1),
  modificationPolicy: z.enum(["locked", "adaptable", "inspiration-only"]),
  rightsStatus: z.enum(["cleared", "restricted", "unknown"]),
  providerScopes: z.array(z.enum(["local-html-svg", "figma", "manual"])),
  storage: AssetStorageSchema,
  allowedTreatments: z.array(z.string().min(1)),
  prohibitedTreatments: z.array(z.string().min(1)),
  visualNotes: z.record(z.string(), z.string().min(1)),
  responsiveGuidance: z.string().min(1),
  accessibilityIntent: z.string().min(1),
  relatedArtifactIds: z.array(z.string().min(1)),
  relatedFeedbackIds: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const FeedbackClassificationSchema = z.enum([
  "question", "requested-change", "creative-direction", "constraint", "suggestion",
  "approval-condition", "unresolved-conflict", "positive-feedback"
]);

export const FeedbackTargetSchema = z.object({
  kind: z.enum(["project", "asset", "artifact"]),
  id: z.string().min(1),
  version: z.number().int().positive().optional()
}).strict();

export const FeedbackRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  originalText: z.string().min(1),
  author: z.string().min(1).optional(),
  source: z.string().min(1),
  sourceDate: IsoDate.optional(),
  target: FeedbackTargetSchema.optional(),
  classifications: z.array(FeedbackClassificationSchema).min(1),
  interpretation: z.string().min(1),
  resolutionStatus: z.enum(["open", "resolved", "superseded"]),
  resolution: z.string().min(1).optional(),
  resultingArtifactIds: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const ArtifactRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "creative-brief", "existing-site-audit", "identity-thesis", "research-board",
    "creative-territory", "visual-language", "composition-study", "decision-journal",
    "implementation-handoff", "asset-dossier"
  ]),
  version: z.number().int().positive(),
  path: z.string().min(1),
  status: ArtifactStatusSchema,
  visibility: ArtifactVisibilitySchema.default("project"),
  assetIds: z.array(z.string().min(1)).default([]),
  provider: z.enum(["local-html-svg", "figma", "manual"]).optional(),
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
  reviewerId: z.string().min(1).optional(),
  reason: z.string().min(1),
  createdAt: IsoDate
}).strict();

export const ProjectManifestSchema = z.object({
  schemaVersion: z.literal(2),
  harnessVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: ProjectKindSchema
  }).strict(),
  stage: StageSchema,
  participants: z.array(ParticipantRecordSchema),
  decisionOwners: z.array(DecisionOwnerRecordSchema),
  artifacts: z.array(ArtifactRecordSchema),
  approvals: z.array(ApprovalRecordSchema),
  assets: z.array(AssetRecordSchema),
  feedback: z.array(FeedbackRecordSchema),
  references: z.array(ReferenceRecordSchema),
  unresolvedQuestions: z.array(z.string().min(1)),
  createdAt: IsoDate,
  updatedAt: IsoDate
}).strict();

export const AnyProjectManifestSchema = z.union([
  ProjectManifestSchema,
  ProjectManifestV1Schema
]);
```

Export inferred types for every public schema. Task 2 adds cross-record and rights refinements; Task 3 adds feedback behavior, while this task establishes the complete structural contract used by migration.

- [ ] **Step 4: Write failing migration and compatibility-reader tests**

Test all of the following in `tests/domain/migration.test.ts` and `tests/storage/project-store.test.ts`:

```ts
expect(migrateManifest(v1, "0.2.0", new Date(now))).toMatchObject({
  schemaVersion: 2,
  harnessVersion: "0.2.0",
  participants: [],
  decisionOwners: [],
  assets: [],
  feedback: [],
  artifacts: v1.artifacts,
  approvals: v1.approvals,
  stage: v1.stage
});

await expect(store.load()).rejects.toThrow(/migration required/i);
await expect(store.inspect()).resolves.toMatchObject({ schemaVersion: 1 });
```

Also assert that `ProjectStore.migrate("0.2.0", now)` writes a byte-for-byte v1 backup at `.creative-preproduction/manifest.json.v1.backup`, writes a valid v2 manifest atomically, and refuses to overwrite an existing backup.

- [ ] **Step 5: Run migration tests and confirm missing interfaces**

Run: `npm test -- tests/domain/migration.test.ts tests/storage/project-store.test.ts`

Expected: FAIL because migration and compatibility methods are absent.

- [ ] **Step 6: Implement pure migration and store behavior**

Use these interfaces:

```ts
export class ManifestMigrationRequiredError extends Error {
  readonly foundVersion: number;
  constructor(foundVersion: number);
}

export function migrateManifest(
  manifest: LegacyProjectManifest,
  harnessVersion: string,
  now?: Date
): ProjectManifest;

export class ProjectStore {
  constructor(readonly root: string);
  inspect(): Promise<AnyProjectManifest>;
  load(): Promise<ProjectManifest>;
  save(manifest: ProjectManifest): Promise<void>;
  migrate(harnessVersion: string, now?: Date): Promise<ProjectManifest>;
}
```

`inspect` parses either schema. `load` returns only v2 and throws `ManifestMigrationRequiredError(1)` for v1. `migrate` reads v1, creates the backup with exclusive creation semantics, passes the value to `migrateManifest`, and writes through the existing atomic writer. It returns an existing v2 manifest unchanged rather than creating another backup.

- [ ] **Step 7: Update foundation constructors, initialization, and fixtures to canonical v2**

Modify `createArtifact` so every ordinary artifact begins with `visibility: "project"` and `assetIds: []`; `reviseArtifact` preserves both fields. Update `initializeProject` to write schema version 2 with empty `participants`, `decisionOwners`, `assets`, and `feedback` collections. Add the four collections to every canonical manifest fixture in workflow, artifact, validation, store, initializer, and end-to-end tests. Add `visibility` and `assetIds` to explicitly typed artifact fixtures. Keep only the migration fixtures at schema version 1.

- [ ] **Step 8: Register the explicit migration CLI**

Move the initializer's package-root/version lookup into `src/services/package-info.ts` and export it for both initialization and migration:

```ts
export interface HarnessPackageInfo {
  root: string;
  version: string;
}

export async function findHarnessPackage(): Promise<HarnessPackageInfo>;
```

Add:

```ts
export function registerMigrateCommand(program: Command): void;
```

The command syntax is `creative-preproduction migrate --root <path>`. It locates the package version, migrates explicitly, and prints `Migrated <project name> to schema version 2`. Register it in `createProgram`.

- [ ] **Step 9: Verify versioning and migration**

Run: `npm test`

Expected: all foundation and migration tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 10: Commit schema version 2 and migration**

```bash
git add src/domain/schema.ts src/domain/migration.ts src/storage/project-store.ts src/services/initializer.ts src/services/artifacts.ts src/services/package-info.ts src/commands/migrate.ts src/cli.ts tests/domain/schema.test.ts tests/domain/migration.test.ts tests/domain/workflow.test.ts tests/services/artifacts.test.ts tests/services/initializer.test.ts tests/services/validation.test.ts tests/storage/project-store.test.ts tests/e2e/foundation-flow.test.ts
git commit -m "feat: migrate projects to creative collaboration schema"
```

---

### Task 2: Participants, decision owners, and supplied assets

**Files:**
- Modify: `src/domain/schema.ts`
- Create: `src/services/participants.ts`
- Create: `src/services/assets.ts`
- Create: `src/services/asset-dossier.ts`
- Create: `templates/asset-dossier.md`
- Modify: `src/services/initializer.ts`
- Create: `tests/services/participants.test.ts`
- Create: `tests/services/assets.test.ts`
- Create: `tests/services/asset-dossier.test.ts`

**Interfaces:**
- Consumes: schema-version-2 `ProjectManifest`
- Produces: participant/decision-owner mutations, asset registration/update functions, and a deterministic human-readable asset dossier used by policy, CLI, and adapters

- [ ] **Step 1: Write failing participant and authority tests**

Cover duplicate participant IDs, missing decision-owner participants, replacing the owner for one decision area, and preserving owners for other areas.

```ts
const withLead = addParticipant(manifest, {
  id: "mina-shah",
  name: "Mina Shah",
  role: "creative-lead",
  now: new Date(now)
});

expect(setDecisionOwner(withLead, {
  area: "creative-direction",
  participantId: "mina-shah"
}).decisionOwners).toEqual([
  { area: "creative-direction", participantId: "mina-shah" }
]);
```

- [ ] **Step 2: Write failing asset-policy tests**

Prove that:

- `unknown` rights require `{ kind: "private", ref: <opaque-id> }` storage.
- `cleared` assets may use a managed project-relative path.
- absolute managed paths are rejected.
- locked assets reject non-empty allowed treatments.
- asset updates preserve `createdAt` and change `updatedAt`.
- duplicate IDs are rejected.

Use this exact successful record shape:

```ts
const asset = createAsset({
  id: "campaign-portrait",
  title: "Campaign portrait",
  creator: "Grounds creative team",
  source: "Creative handoff 2026-09-17",
  creativeOwner: "mina-shah",
  intendedRole: "Primary home-page story image",
  modificationPolicy: "adaptable",
  rightsStatus: "cleared",
  providerScopes: ["local-html-svg", "figma"],
  storage: { kind: "managed", path: "public/images/campaign-portrait.jpg" },
  allowedTreatments: ["responsive crop", "subtle color overlay"],
  prohibitedTreatments: ["generative extension"],
  visualNotes: { focalPoint: "Face in right third", negativeSpace: "Open left field" },
  responsiveGuidance: "Protect the face; use a portrait crop below 620px.",
  accessibilityIntent: "Informative portrait identifying the featured artist.",
  unresolvedQuestions: [],
  now: new Date(now)
});
```

- [ ] **Step 3: Run service tests and confirm missing modules**

Run: `npm test -- tests/services/participants.test.ts tests/services/assets.test.ts`

Expected: FAIL because the services do not exist.

- [ ] **Step 4: Implement asset invariant validation**

The structural schema was added in Task 1. In `src/services/assets.ts`, validate the cross-field rules before constructing a record:

```ts
function assertAssetInvariants(input: CreateAssetInput): void {
  if (input.storage.kind === "managed"
    && (isAbsolute(input.storage.path) || normalize(input.storage.path).startsWith(".."))) {
    throw new Error("Managed asset paths must be project-relative and remain inside the project.");
  }
  if (input.rightsStatus === "unknown" && input.storage.kind !== "private") {
    throw new Error("Unknown-rights assets require private storage.");
  }
  if (input.rightsStatus === "unknown"
    && (input.providerScopes.length !== 1 || input.providerScopes[0] !== "local-html-svg")) {
    throw new Error("Unknown-rights assets are limited to local HTML/SVG studies.");
  }
  if (input.modificationPolicy === "locked" && input.allowedTreatments.length > 0) {
    throw new Error("Locked assets cannot declare allowed modifications.");
  }
}
```

For `restricted`, an empty provider scope is normalized to `["local-html-svg"]`; any explicitly supplied additional scope is preserved for policy evaluation.

- [ ] **Step 5: Implement focused participant and asset services**

```ts
export interface CreateAssetInput {
  id: string;
  title: string;
  creator?: string;
  source: string;
  creativeOwner?: string;
  intendedRole: string;
  modificationPolicy: AssetRecord["modificationPolicy"];
  rightsStatus: AssetRecord["rightsStatus"];
  providerScopes: AssetRecord["providerScopes"];
  storage: AssetRecord["storage"];
  allowedTreatments: string[];
  prohibitedTreatments: string[];
  visualNotes: Record<string, string>;
  responsiveGuidance: string;
  accessibilityIntent: string;
  unresolvedQuestions: string[];
  now?: Date;
}

export interface UpdateAssetInput {
  title?: string;
  creator?: string;
  source?: string;
  creativeOwner?: string;
  intendedRole?: string;
  modificationPolicy?: AssetRecord["modificationPolicy"];
  rightsStatus?: AssetRecord["rightsStatus"];
  providerScopes?: AssetRecord["providerScopes"];
  storage?: AssetRecord["storage"];
  allowedTreatments?: string[];
  prohibitedTreatments?: string[];
  visualNotes?: Record<string, string>;
  responsiveGuidance?: string;
  accessibilityIntent?: string;
  unresolvedQuestions?: string[];
}

export function addParticipant(
  manifest: ProjectManifest,
  input: { id: string; name: string; role: ParticipantRecord["role"]; now?: Date }
): ProjectManifest;

export function setDecisionOwner(
  manifest: ProjectManifest,
  input: { area: DecisionOwnerRecord["area"]; participantId: string }
): ProjectManifest;

export function createAsset(input: CreateAssetInput): AssetRecord;
export function addAsset(manifest: ProjectManifest, asset: AssetRecord): ProjectManifest;
export function updateAsset(
  manifest: ProjectManifest,
  assetId: string,
  changes: UpdateAssetInput,
  now?: Date
): ProjectManifest;
```

`createAsset` initializes `relatedArtifactIds` and `relatedFeedbackIds` as empty arrays. All functions are immutable and return new arrays. `setDecisionOwner` requires an existing participant. `creativeOwner`, when supplied, must identify an existing participant before `addAsset` persists the record. `updateAsset` reruns the complete cross-field invariant check on the merged record and preserves `createdAt`.

- [ ] **Step 6: Write failing asset-dossier tests**

Test that an initialized project receives `asset-dossier.md`, assets render in ID order, every creative and rights field appears, and private filesystem paths or original source filenames never appear.

- [ ] **Step 7: Implement the human-readable asset dossier**

Add `renderAssetDossier(manifest: ProjectManifest): string` and `writeAssetDossier(root: string, manifest: ProjectManifest): Promise<void>` in `src/services/asset-dossier.ts`. Render one section per asset with its title, intended role, owner, modification policy, rights, provider scopes, allowed/prohibited treatments, responsive guidance, accessibility intent, visual notes, and open questions. Sort by asset ID. The writer replaces `.creative-preproduction/asset-dossier.md` atomically.

Add `templates/asset-dossier.md` with a title and explanation and include it in initialization.

- [ ] **Step 8: Verify participant, asset, and dossier behavior**

Run: `npm test -- tests/services/participants.test.ts tests/services/assets.test.ts tests/services/asset-dossier.test.ts tests/services/initializer.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 9: Commit people, authority, and supplied assets**

```bash
git add src/domain/schema.ts src/services/participants.ts src/services/assets.ts src/services/asset-dossier.ts src/services/initializer.ts templates/asset-dossier.md tests/services/participants.test.ts tests/services/assets.test.ts tests/services/asset-dossier.test.ts tests/services/initializer.test.ts
git commit -m "feat: record creative owners and supplied assets"
```

---

### Task 3: Verbatim feedback and creative-direction coordination

**Files:**
- Modify: `src/domain/schema.ts`
- Create: `src/services/feedback.ts`
- Create: `src/creative-direction/coordinator.ts`
- Create: `src/creative-direction/questions.ts`
- Create: `tests/services/feedback.test.ts`
- Create: `tests/creative-direction/coordinator.test.ts`

**Interfaces:**
- Consumes: participants, assets, artifacts, unresolved project questions
- Produces: immutable feedback records, explicit resolution, declared posture, next action, and relayable question packets

- [ ] **Step 1: Write failing verbatim-feedback tests**

Verify exact preservation, including punctuation and line breaks; separate interpretation; optional author/source date/target; multiple classifications; and explicit resolution.

```ts
const originalText = "Keep the crop wide.\nThe negative space is important — please do not fill it.";
const record = createFeedback({
  id: "feedback-portrait-1",
  originalText,
  author: "Mina Shah",
  source: "Team chat",
  target: { kind: "asset", id: "campaign-portrait" },
  classifications: ["constraint", "creative-direction"],
  interpretation: "Preserve the image's left-side negative space.",
  now: new Date(now)
});

expect(record.originalText).toBe(originalText);
expect(record.resolutionStatus).toBe("open");
```

Assert that empty-after-trimming input is rejected but the stored non-empty string is not trimmed or rewritten.

- [ ] **Step 2: Write failing coordinator and question-packet tests**

Test these deterministic rules:

- no creative lead → `lead` posture;
- creative lead participant → `partner` posture;
- any asset → add `expansion` posture;
- unanswered project and asset questions appear once in the packet;
- open feedback classified as `question`, `approval-condition`, or `unresolved-conflict` appears with its source ID;
- resolved feedback is excluded;
- no score or grade language appears.

```ts
expect(determinePostures(manifestWithLeadAndAsset)).toEqual(["partner", "expansion"]);
expect(buildQuestionPacket(manifestWithOpenItems)).toEqual({
  postures: ["partner", "expansion"],
  recipientParticipantId: "mina-shah",
  items: [
    { source: "asset:campaign-portrait", question: "May the mobile crop move the subject?" },
    { source: "feedback:feedback-crop-question", question: "Confirm the minimum negative-space requirement." }
  ]
});
```

In this fixture, `feedback-crop-question` is an open feedback record classified as `question`; `feedback-portrait-1` from Step 1 remains a `constraint` and does not become a question by inference.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- tests/services/feedback.test.ts tests/creative-direction/coordinator.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Define feedback service inputs without duplicating the schema**

Use the structural record contract created in Task 1 and expose this construction input:

```ts
export interface CreateFeedbackInput {
  id: string;
  originalText: string;
  author?: string;
  source: string;
  sourceDate?: Date;
  target?: FeedbackTarget;
  classifications: FeedbackClassification[];
  interpretation: string;
  now?: Date;
}
```

`createFeedback` sets `resolutionStatus: "open"`, `resultingArtifactIds: []`, and identical creation/update timestamps. It validates non-empty text with `originalText.trim()` but stores the supplied `originalText` unchanged.

- [ ] **Step 5: Implement feedback creation, addition, and resolution**

```ts
export function createFeedback(input: CreateFeedbackInput): FeedbackRecord;
export function addFeedback(
  manifest: ProjectManifest,
  feedback: FeedbackRecord
): ProjectManifest;
export function resolveFeedback(
  manifest: ProjectManifest,
  input: { feedbackId: string; resolution: string; resultingArtifactIds?: string[]; now?: Date }
): ProjectManifest;
```

`addFeedback` rejects duplicate IDs and validates a supplied target against the current manifest. A missing target is allowed and later reported by validation. `resolveFeedback` never changes `originalText`, classifications, author, or source.

- [ ] **Step 6: Implement the coordinator and question packet**

```ts
export type CreativePosture = "lead" | "partner" | "expansion";

export interface QuestionPacketItem {
  source: string;
  question: string;
}

export interface QuestionPacket {
  postures: CreativePosture[];
  recipientParticipantId?: string;
  items: QuestionPacketItem[];
}

export function determinePostures(manifest: ProjectManifest): CreativePosture[];
export function buildQuestionPacket(manifest: ProjectManifest): QuestionPacket;
export function describeNextCreativeAction(manifest: ProjectManifest): string;
```

The coordinator is deterministic and evidence-based. It does not generate visual taste judgments; adapters use its structured result to guide a conversational agent.

- [ ] **Step 7: Verify feedback and coordination**

Run: `npm test -- tests/services/feedback.test.ts tests/creative-direction/coordinator.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 8: Commit feedback and coordination**

```bash
git add src/domain/schema.ts src/services/feedback.ts src/creative-direction/coordinator.ts src/creative-direction/questions.ts tests/services/feedback.test.ts tests/creative-direction/coordinator.test.ts
git commit -m "feat: organize creative feedback and questions"
```

---

### Task 4: Private workspace, provisional artifacts, and local HTML/SVG studies

**Files:**
- Create: `src/storage/private-workspace.ts`
- Create: `src/services/provisional.ts`
- Create: `src/providers/html-svg.ts`
- Modify: `src/services/initializer.ts`
- Modify: `src/services/artifacts.ts`
- Create: `tests/storage/private-workspace.test.ts`
- Create: `tests/services/provisional.test.ts`
- Create: `tests/providers/html-svg.test.ts`

**Interfaces:**
- Consumes: v2 assets, artifact records, project root
- Produces: opaque private storage, provisional composition studies, HTML/SVG preview files, and safe promotion into a new draft

- [ ] **Step 1: Write failing private-workspace tests**

Prove that initialization creates `.creative-preproduction/private/.gitignore` with exactly:

```gitignore
*
!.gitignore
```

Test generated-ID storage, refusal to resolve `..` or absolute paths, copying a supplied source into an opaque location, and resolving a known private reference without exposing the original filename.

```ts
const stored = await workspace.importFile("campaign-portrait", sourcePath);
expect(stored.ref).toBe("campaign-portrait");
expect(stored.relativePath).toBe(".creative-preproduction/private/assets/campaign-portrait/source");
expect(await readFile(join(root, stored.relativePath))).toEqual(sourceBytes);
```

- [ ] **Step 2: Write failing provisional and promotion tests**

Cover:

- creation as `status: "provisional"` and `visibility: "private"`;
- required question, rationale, assumptions, blockers, and asset lineage;
- rejection by `recordApproval`;
- promotion rejection while any referenced asset has `unknown` rights;
- promotion to a new `draft`, `project`-visibility version at a caller-supplied safe path after rights clear;
- preservation of the provisional source record.

```ts
const promoted = promoteProvisionalArtifact(provisional, manifestWithClearedAsset, {
  path: ".creative-preproduction/artifacts/home-composition-v2.html",
  rationale: "Rights and responsive crop are confirmed.",
  now: new Date(now)
});

expect(promoted).toMatchObject({
  id: provisional.id,
  version: provisional.version + 1,
  parentVersion: provisional.version,
  status: "draft",
  visibility: "project"
});
```

- [ ] **Step 3: Write failing HTML/SVG provider tests**

Assert that a private study:

- creates a provisional `composition-study` artifact;
- writes `index.html` below the private workspace;
- contains a visible `PRIVATE PROVISIONAL STUDY` banner;
- embeds the creative question, rationale, assumptions, and asset guidance;
- includes a responsive viewport and CSS breakpoint;
- uses only local paths and contains no `http://`, `https://`, protocol-relative URL, external script, or external stylesheet;
- permits unknown-rights assets only because the output is private and local.

- [ ] **Step 4: Run private-study tests and confirm missing modules**

Run: `npm test -- tests/storage/private-workspace.test.ts tests/services/provisional.test.ts tests/providers/html-svg.test.ts`

Expected: FAIL because the private workspace, provisional service, and provider do not exist.

- [ ] **Step 5: Implement opaque private storage**

```ts
export class PrivateWorkspace {
  constructor(readonly root: string);
  initialize(): Promise<void>;
  importFile(ref: string, sourcePath: string): Promise<{
    ref: string;
    relativePath: string;
  }>;
  resolveRef(ref: string): string;
  studyDirectory(artifactId: string, version: number): string;
}
```

All final paths must resolve inside `.creative-preproduction/private/`. Use generated normalized IDs, never source basenames, for managed private destinations.

- [ ] **Step 6: Implement provisional construction and promotion**

```ts
export interface CreateProvisionalInput {
  id: string;
  kind: ArtifactRecord["kind"];
  path: string;
  question: string;
  rationale: string;
  assumptions: string[];
  blockers: string[];
  assetIds: string[];
  provider: NonNullable<ArtifactRecord["provider"]>;
  now?: Date;
}

export function createProvisionalArtifact(input: CreateProvisionalInput): ArtifactRecord;
export function promoteProvisionalArtifact(
  current: ArtifactRecord,
  manifest: ProjectManifest,
  input: { path: string; rationale: string; now?: Date }
): ArtifactRecord;
```

Add `question`, `assumptions`, and `blockers` as optional artifact fields that are required by a schema refinement when status is `provisional`. Modify `recordApproval` to throw `Provisional artifacts cannot be approved; promote the work to a draft first.`

- [ ] **Step 7: Implement the minimal private HTML/SVG provider**

```ts
export interface PrivateHtmlStudyInput {
  id: string;
  title: string;
  question: string;
  rationale: string;
  assumptions: string[];
  assetIds: string[];
  compositionNotes: string[];
  now?: Date;
}

export async function createPrivateHtmlStudy(
  root: string,
  manifest: ProjectManifest,
  input: PrivateHtmlStudyInput
): Promise<{ artifact: ArtifactRecord; previewPath: string }>;
```

Render a deterministic semantic HTML document with inline CSS, a warning banner, a responsive two-column-to-one-column composition, asset cards, source/permission notes, and inline SVG fallback graphics when an asset cannot be rendered. Escape all user-supplied text before interpolation. Do not include script tags or network resources. The created artifact records `provider: "local-html-svg"`.

- [ ] **Step 8: Initialize the private workspace and verify all tests**

Call `PrivateWorkspace.initialize()` during project initialization after the manifest lock is acquired. Update initializer cleanup expectations to retain the nested `.gitignore` and no private content.

Run: `npm test -- tests/storage/private-workspace.test.ts tests/services/provisional.test.ts tests/providers/html-svg.test.ts tests/services/initializer.test.ts tests/services/artifacts.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 9: Commit private provisional exploration**

```bash
git add src/storage/private-workspace.ts src/services/provisional.ts src/providers/html-svg.ts src/services/initializer.ts src/services/artifacts.ts tests/storage/private-workspace.test.ts tests/services/provisional.test.ts tests/providers/html-svg.test.ts tests/services/initializer.test.ts tests/services/artifacts.test.ts
git commit -m "feat: create private provisional visual studies"
```

---

### Task 5: Rights, decision-owner, approval, and handoff policy

**Files:**
- Create: `src/domain/policy.ts`
- Modify: `src/domain/workflow.ts`
- Modify: `src/services/artifacts.ts`
- Modify: `src/services/validation.ts`
- Create: `tests/domain/policy.test.ts`
- Modify: `tests/domain/workflow.test.ts`
- Modify: `tests/services/artifacts.test.ts`
- Modify: `tests/services/validation.test.ts`

**Interfaces:**
- Consumes: assets, feedback, participants, decision owners, artifacts, approvals, provider name
- Produces: reusable policy decisions, explicit review application, handoff blockers, and stable diagnostics

- [ ] **Step 1: Write failing provider and promotion policy tests**

Test exact decisions for:

```ts
expect(canUseAssetWithProvider(unknownAsset, "local-html-svg")).toEqual({
  allowed: true,
  reasons: []
});

expect(canUseAssetWithProvider(unknownAsset, "figma")).toEqual({
  allowed: false,
  reasons: ["Asset campaign-portrait has unknown rights and is limited to private local HTML/SVG studies."]
});
```

Also cover cleared Figma scope, restricted absent scope, inspiration-only exclusion from deliverables, locked treatment changes, and private storage referenced by project-visible artifacts.

- [ ] **Step 2: Write failing decision-owner and handoff tests**

Test that:

- a configured creative-direction owner must approve consequential creative artifacts through matching `reviewerId`;
- tier rank alone cannot substitute for that owner;
- no owner preserves the existing tier-based behavior;
- open `approval-condition` and `unresolved-conflict` feedback block handoff;
- provisional or private artifacts referenced by the implementation handoff block handoff;
- assets referenced by the implementation handoff block handoff when rights are unknown or the recorded restriction disallows production use;
- routine draft work does not create a new creative approval requirement by itself.

- [ ] **Step 3: Write failing explicit-review application tests**

Add a manifest-level service function test:

```ts
const reviewed = applyReviewDecision(manifest, {
  artifactId: "visual-language",
  artifactVersion: 2,
  tier: "creative-lead",
  decision: "approved",
  reviewer: "Mina Shah",
  reviewerId: "mina-shah",
  reason: "The image treatment and responsive composition preserve the approved direction.",
  now: new Date(now)
});

expect(reviewed.approvals.at(-1)?.artifactVersion).toBe(2);
expect(reviewed.artifacts.find(({ id, version }) => id === "visual-language" && version === 2)?.status)
  .toBe("approved");
```

For an already persisted approved artifact, later feedback decisions append approval history without mutating the approved artifact record.

- [ ] **Step 4: Run policy tests and confirm failure**

Run: `npm test -- tests/domain/policy.test.ts tests/domain/workflow.test.ts tests/services/artifacts.test.ts tests/services/validation.test.ts`

Expected: FAIL because extension policy is absent.

- [ ] **Step 5: Implement reusable policy results**

```ts
export type PolicyResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

export type CreativeProvider = "local-html-svg" | "figma" | "manual";

export function canUseAssetWithProvider(
  asset: AssetRecord,
  provider: CreativeProvider
): PolicyResult;

export function canPromoteArtifact(
  manifest: ProjectManifest,
  artifact: ArtifactRecord
): PolicyResult;

export function evaluateHandoffPolicy(manifest: ProjectManifest): PolicyResult;

export function hasDecisionOwnerApproval(
  manifest: ProjectManifest,
  artifact: ArtifactRecord,
  area: DecisionOwnerRecord["area"]
): boolean;
```

Return stable, human-readable reasons in deterministic order. Never collapse multiple independent blockers into one generic message. Creative-direction ownership applies to the latest selected `creative-territory` and `visual-language` records; implementation-readiness ownership applies to `implementation-handoff`. Composition studies require named creative-owner approval only when an open approval condition targets that exact study.

- [ ] **Step 6: Implement manifest-level explicit review**

```ts
export interface ApplyReviewDecisionInput {
  artifactId: string;
  artifactVersion: number;
  tier: ApprovalRecord["tier"];
  decision: ApprovalRecord["decision"];
  reviewer: string;
  reviewerId?: string;
  reason: string;
  now?: Date;
}

export function applyReviewDecision(
  manifest: ProjectManifest,
  input: ApplyReviewDecisionInput
): ProjectManifest;
```

The function resolves the exact artifact version, rejects provisional work, creates an approval through `recordApproval`, replaces a non-approved artifact version with the returned copy, appends the approval, and leaves an already persisted approved artifact byte-for-byte unchanged.

- [ ] **Step 7: Integrate policy into workflow and validation**

Before `review → handoff` succeeds, append every `evaluateHandoffPolicy` reason to the transition result. Extend diagnostics with exact codes:

```ts
type ExtensionDiagnosticCode =
  | "asset-private-reference"
  | "asset-rights-blocked"
  | "asset-provider-blocked"
  | "feedback-target-missing"
  | "feedback-condition-open"
  | "decision-owner-approval-missing"
  | "provisional-in-handoff"
  | "private-file-missing"
  | "tracked-path-unsafe";
```

Missing feedback targets and missing private files are warnings. Rights, provider, decision-owner, private-reference, provisional-handoff, and unsafe tracked-path violations are errors. Preserve the existing sorting rule by code then subject ID.

- [ ] **Step 8: Verify policy, workflow, approval, and diagnostics**

Run: `npm test -- tests/domain/policy.test.ts tests/domain/workflow.test.ts tests/services/artifacts.test.ts tests/services/validation.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 9: Commit policy-aware approval and handoff**

```bash
git add src/domain/policy.ts src/domain/workflow.ts src/services/artifacts.ts src/services/validation.ts tests/domain/policy.test.ts tests/domain/workflow.test.ts tests/services/artifacts.test.ts tests/services/validation.test.ts
git commit -m "feat: enforce creative authority and asset policy"
```

---

### Task 6: Usable CLI commands for collaboration records

**Files:**
- Create: `src/commands/participants.ts`
- Create: `src/commands/assets.ts`
- Create: `src/commands/feedback.ts`
- Create: `src/commands/questions.ts`
- Create: `src/commands/explore-private.ts`
- Create: `src/commands/promote.ts`
- Create: `src/commands/review.ts`
- Modify: `src/commands/status.ts`
- Modify: `src/cli.ts`
- Create: `tests/cli/collaboration.test.ts`
- Modify: `tests/cli/help.test.ts`

**Interfaces:**
- Consumes: all public services from Tasks 1–5
- Produces: non-interactive commands that agents and teammates can invoke without directly editing JSON

- [ ] **Step 1: Write failing CLI help and behavior tests**

Verify help exposes these command forms:

```text
participant add --id <slug> --name <name> --role <role>
participant own --area <area> --participant <id>
asset add --id <slug> --title <title> --source <description> --role <description> --modification <policy> --rights <status> --path <path>
asset update --id <slug> --rights <status> --provider <scope>
feedback import --id <slug> --file <path> --source <description> --class <classification> --interpretation <text>
feedback resolve --id <slug> --resolution <text> --artifact <id>
questions
explore-private --id <slug> --title <title> --question <text> --rationale <text> --asset <id>
promote --artifact <id> --version <number> --path <project-relative-path> --rationale <text>
review --artifact <id> --version <number> --tier <tier> --decision <decision> --reviewer <name> --reason <text>
```

CLI tests must use temporary roots and call `createProgram().parseAsync`. Assert exact persistence and stable output, not only help text.

- [ ] **Step 2: Run CLI tests and confirm commands are missing**

Run: `npm test -- tests/cli/collaboration.test.ts tests/cli/help.test.ts`

Expected: FAIL because the commands are not registered.

- [ ] **Step 3: Implement participant and asset commands**

All participant and asset commands load through `ProjectStore`, call the public immutable service, save once, and print one stable confirmation line. `asset add` treats a supplied file with `unknown` rights as private: import it through `PrivateWorkspace`, discard the original filename from tracked state, and persist private storage. Cleared or restricted managed paths must be project-relative. `asset update` calls `updateAsset`; when changing rights away from `unknown`, it requires a caller-supplied managed `--path` before the asset can participate in promotion or handoff. After each successful asset mutation, call `writeAssetDossier` so the Markdown projection matches the committed manifest.

Permit repeatable `--allow`, `--prohibit`, and `--provider` options. Require responsive and accessibility guidance so records are not silently incomplete.

- [ ] **Step 4: Implement feedback import and question packet commands**

`feedback import` accepts exactly one of `--message <text>` or `--file <path>`. File content is read verbatim. Repeatable `--class` values are validated by `FeedbackClassificationSchema`. Optional target flags are `--target-kind`, `--target-id`, and `--target-version`; require the kind and ID together. `feedback resolve` calls `resolveFeedback`, permits repeatable `--artifact` lineage, and cannot change original feedback text.

`questions` prints the declared postures, intended recipient when present, and every source-prefixed question. It prints `No unresolved creative questions.` when empty.

- [ ] **Step 5: Implement private exploration and promotion commands**

`explore-private` calls `createPrivateHtmlStudy`, appends its artifact to the manifest, saves once, and prints the local preview path. Require at least one `--asset`. Permit repeatable `--assumption` and `--note`.

`promote` resolves the exact provisional version, calls `promoteProvisionalArtifact`, verifies the caller-supplied project-visible file exists, appends the new version, and saves. It never copies the private preview into the project-visible location.

- [ ] **Step 6: Implement explicit review command and richer status**

`review` calls `applyReviewDecision`. Support optional `--reviewer-id`; if a decision owner is required, policy will prevent handoff until the matching ID approves.

Extend `status` with participant, asset, open-feedback, and provisional counts; declared postures; next creative action; and migration guidance for v1 projects. Keep output score-free.

- [ ] **Step 7: Register commands and verify CLI behavior**

Register every command exactly once in `createProgram`.

Run: `npm test -- tests/cli/collaboration.test.ts tests/cli/help.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 8: Commit collaboration CLI**

```bash
git add src/commands/participants.ts src/commands/assets.ts src/commands/feedback.ts src/commands/questions.ts src/commands/explore-private.ts src/commands/promote.ts src/commands/review.ts src/commands/status.ts src/cli.ts tests/cli/collaboration.test.ts tests/cli/help.test.ts
git commit -m "feat: expose creative collaboration commands"
```

---

### Task 7: Agent-neutral context with Codex and Claude adapters

**Files:**
- Create: `src/adapters/types.ts`
- Create: `src/adapters/shared.ts`
- Create: `src/adapters/codex.ts`
- Create: `src/adapters/claude.ts`
- Create: `src/commands/context.ts`
- Modify: `src/cli.ts`
- Create: `tests/adapters/conformance.test.ts`

**Interfaces:**
- Consumes: coordinator posture, question packets, assets, feedback, and policy blockers
- Produces: host-specific text contexts with the same agent-neutral creative-direction contract

- [ ] **Step 1: Write failing adapter conformance tests**

Run the same manifest fixture through Codex and Claude adapters and assert both outputs contain:

- declared `partner` and `expansion` postures;
- the exact active identity thesis and asset permissions;
- original feedback plus a visibly separate interpretation;
- unresolved question sources;
- private/provisional restrictions;
- the instruction that only an explicit review action creates approval;
- coach, collaborator, and maker role guidance;
- no creative score language.

Also assert the host-specific wrapper names its host and that output order is deterministic.

- [ ] **Step 2: Run conformance tests and confirm missing adapters**

Run: `npm test -- tests/adapters/conformance.test.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Define the shared adapter contract**

```ts
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
}

export interface AgentAdapter {
  readonly host: AgentHost;
  build(input: { root: string; manifest: ProjectManifest }): Promise<CreativeDirectionContext>;
  render(context: CreativeDirectionContext): string;
}
```

`src/adapters/shared.ts` builds all host-neutral fields. It reads the latest approved `identity-thesis`, selected `creative-territory`, and `visual-language` files through project-relative paths that resolve inside `root`; missing or escaping paths become blockers rather than invented context. Host adapters only wrap and render; they cannot change approval, rights, or provider policy.

- [ ] **Step 4: Implement Codex and Claude renderers**

Each renderer produces these headings in order:

```text
Creative Preproduction Context
Current Posture
Operating Rules
Approved Context
Supplied Assets and Permissions
Imported Feedback
Unresolved Questions
Blocking Conditions
Next Creative Action
```

Both instruct the host to ask focused questions, preserve human authority, declare meaningful role changes, challenge generic patterns with evidence, and use public harness commands rather than editing the manifest directly.

- [ ] **Step 5: Add context CLI command**

Register `context --host <codex|claude> --root <path>`. It loads a migrated project, awaits `adapter.build({ root, manifest })`, renders the selected adapter, and writes the result to stdout without mutating state.

- [ ] **Step 6: Verify adapter equivalence and typing**

Run: `npm test -- tests/adapters/conformance.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit agent adapters**

```bash
git add src/adapters/types.ts src/adapters/shared.ts src/adapters/codex.ts src/adapters/claude.ts src/commands/context.ts src/cli.ts tests/adapters/conformance.test.ts
git commit -m "feat: add Codex and Claude creative direction contexts"
```

---

### Task 8: End-to-end creative-led flow, documentation, and release verification

**Files:**
- Create: `tests/e2e/creative-director-flow.test.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: all public commands and services from Tasks 1–7
- Produces: executable acceptance proof and accurate teammate-facing documentation for version 0.2.0

- [ ] **Step 1: Write the end-to-end acceptance test**

Create one temporary project and prove this exact sequence through exported services or CLI commands:

1. Initialize a version-2 project.
2. Add a creative lead and assign creative-direction ownership.
3. Register an unknown-rights supplied image into private storage.
4. Import an ordinary multiline message and preserve it byte-for-byte.
5. Build a question packet containing the asset and feedback questions.
6. Create a private HTML/SVG composition study using the unknown-rights asset.
7. Confirm validation blocks Figma use, promotion, approval, and handoff.
8. Update the asset to `cleared`, grant required provider scope, and resolve the approval condition.
9. Write a safe project-visible composition file and promote the provisional study into a new draft version.
10. Record explicit creative-lead approval with the correct participant ID.
11. Build Codex and Claude contexts and confirm the same approved facts and no blockers.
12. Create the minimum required approved brief, research board, two territories, selected visual language, and reviewable composition evidence; advance through each existing stage gate through `review` using public interfaces.
13. Create and approve an implementation handoff, transition to `handoff`, reload from disk, and receive no error diagnostics.

- [ ] **Step 2: Run the end-to-end test and repair integration defects only**

Run: `npm test -- tests/e2e/creative-director-flow.test.ts`

Expected: PASS with the original provisional record preserved, a promoted draft/approved lineage, exact original feedback, and handoff reached.

- [ ] **Step 3: Update package version without changing dependencies**

Run: `npm version 0.2.0 --no-git-tag-version`

Expected: `package.json` and `package-lock.json` both report `0.2.0`; dependency versions remain unchanged.

- [ ] **Step 4: Rewrite README boundaries and usage around the usable extension**

Document:

- the creative-director coordinator and three postures;
- v1 migration and backup behavior;
- participant and decision-owner setup;
- supplied-asset policies and example commands;
- verbatim feedback import and question packets;
- private workspace privacy boundary;
- provisional study and promotion behavior;
- explicit review and handoff rules;
- Codex and Claude `context` output;
- the remaining boundary: Figma provider execution, automated messaging imports, Affinity integration, and dashboard are not yet implemented;
- a complete command walkthrough that matches the end-to-end test.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0 and `dist/src/cli.js` exists.

Run: `node dist/src/cli.js --help`

Expected: help lists initialization, migration, status, validation, collaboration, private exploration, review, and context commands without score language.

- [ ] **Step 6: Commit the integrated extension release**

```bash
git add README.md package.json package-lock.json tests/e2e/creative-director-flow.test.ts
git commit -m "test: prove creative director collaboration flow"
git status --short
```

Expected: the final command prints no changed files.

## Release completion check

Before calling the extension complete, compare the final implementation with every acceptance criterion in `docs/superpowers/specs/2026-09-17-creative-director-collaboration-design.md`. Record any intentionally deferred item in README under the explicit product boundary; do not silently omit it or describe it as implemented.
