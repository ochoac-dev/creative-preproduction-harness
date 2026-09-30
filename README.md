# Creative Preproduction Harness

Creative Preproduction Harness 0.2.0 is a local, agent-neutral record of creative direction for a website project. It connects supplied assets, ordinary teammate feedback, private explorations, explicit human decisions, and an implementation handoff. It does not judge taste with a score: readiness comes from evidence, rights, open conditions, and named, version-specific approvals.

## What the coordinator does

The creative-direction coordinator has three compatible postures:

- **Lead:** when no creative person is available, it helps a developer form a provisional direction while leaving consequential approval to a human.
- **Partner:** when a creative lead participates, it organizes questions, alternatives, and implementation implications without replacing their authority.
- **Expansion:** when supplied assets or prior direction exist, it derives hypotheses from that evidence rather than starting from a generic template. Expansion can accompany lead or partner posture.

The harness acts as a coach, collaborator, and maker. It asks focused questions, preserves rationale, and can make bounded local studies. It never fabricates human authority or turns a casual “looks good” into approval.

## Setup and project migration

Requires Node.js 22.12.0 or newer and npm.

```sh
npm install
npm run build
npm test
```

`npm run typecheck` checks TypeScript without emitting files. `npm run build` creates `dist/src/cli.js`.

Initialize a new-site workspace before recording the collaboration:

```sh
node dist/src/cli.js init --root ./website --id river-voices --name "River Voices" --kind new-site
```

New workspaces are schema version 2. A version-1 workspace can be inspected with `status`, which will request an explicit migration:

```sh
node dist/src/cli.js migrate --root ./website
```

Migration writes `.creative-preproduction/manifest.json.v1.backup` with the original bytes, then atomically writes the version-2 manifest. It refuses to overwrite an existing backup. Migration adds empty participant, decision-owner, asset, and feedback collections; it preserves existing artifacts, approvals, references, questions, and stage.

## Team workflow and safety boundaries

Register people and the owner of consequential creative direction before treating visual work as approved:

```sh
node dist/src/cli.js participant add --root ./website --id mina-shah --name "Mina Shah" --role creative-lead
node dist/src/cli.js participant own --root ./website --area creative-direction --participant mina-shah
```

Decision owners are recorded for `creative-direction`, `business-direction`, or `implementation-readiness`. When a named creative-direction owner exists, a major territory, visual language, or condition-bound composition requires that participant’s explicit review. A higher review tier does not silently replace the named person.

Supplied assets carry rights, storage, provider scope, permitted treatment, and accessibility guidance. A cleared asset is managed at a project-relative path; an unknown-rights source is copied to the private workspace and gets an opaque reference rather than its original filename in the manifest.

```sh
node dist/src/cli.js asset add --root ./website --id campaign-portrait --title "Campaign portrait" \
  --source "Client handoff" --role "Home-page lead" --modification adaptable --rights unknown \
  --path ./client-portrait-original.jpg --provider local-html-svg --allow "responsive crop" \
  --prohibit "generative extension" --responsive "Keep the face visible on small screens." \
  --accessibility "Identifies the featured artist."
```

Unknown-rights assets may appear only in private local HTML/SVG studies. They cannot be sent to Figma or another cloud provider, promoted, published, or put in a handoff. Once rights are cleared, provide a managed file and every needed scope:

```sh
node dist/src/cli.js asset update --root ./website --id campaign-portrait --rights cleared \
  --path public/campaign-portrait.jpg --provider local-html-svg --provider figma
```

The harness does not automatically merge, commit, or push project changes. It records local state and keeps source decision-making visible.

## Feedback, questions, and private exploration

Ordinary messages are supported without a chat, email, or Figma connection. Import a pasted message with `--message`, or preserve a file byte-for-byte with `--file`:

```sh
node dist/src/cli.js feedback import --root ./website --id portrait-message --file ./ordinary-message.txt \
  --source "Ordinary teammate message" --author "Mina Shah" --class question --class approval-condition \
  --interpretation "Preserve the left field and confirm the mobile crop." \
  --target-kind asset --target-id campaign-portrait
node dist/src/cli.js questions --root ./website
```

The original wording remains inspectable. Classification and interpretation are separate harness records. A question packet includes unresolved project, asset, and feedback questions. Resolve a condition only after the responsible teammate responds:

```sh
node dist/src/cli.js feedback resolve --root ./website --id portrait-message \
  --resolution "Mina confirmed the protected left field and mobile crop." --artifact portrait-study
```

Create a private provisional composition study while rights or decisions remain open:

```sh
node dist/src/cli.js explore-private --root ./website --id portrait-study --title "Portrait study" \
  --question "Can the supplied portrait lead without filling its negative space?" \
  --rationale "Test the editorial composition privately before rights are cleared." \
  --asset campaign-portrait --assumption "The image stays local." --note "Leave the left field quiet."
```

This writes an HTML/SVG preview below `.creative-preproduction/private/`. The nested ignore rule keeps that workspace out of version control. Provisional artifacts remain private, cannot be approved directly, cannot meet a workflow gate, and cannot enter a handoff. Promotion always creates a new project-visible draft with lineage to the preserved provisional record; it never overwrites the private source:

```sh
# Write the reviewable project-visible file first.
node dist/src/cli.js promote --root ./website --artifact portrait-study --version 1 \
  --path .creative-preproduction/artifacts/portrait-study-v2.html \
  --rationale "Ready for explicit creative review."
node dist/src/cli.js review --root ./website --artifact portrait-study --version 2 \
  --tier creative-lead --decision approved --reviewer "Mina Shah" --reviewer-id mina-shah \
  --reason "Mina approves the exact promoted composition version."
```

`review` is the only action that records formal approval. It always names an artifact and version, reviewer, tier, decision, and reason. Positive feedback, a question resolution, or a file on disk is not approval.

## Complete creative-led walkthrough

The executable acceptance flow is [`tests/e2e/creative-director-flow.test.ts`](tests/e2e/creative-director-flow.test.ts). Its order is the recommended teammate workflow:

```sh
npm test -- tests/e2e/creative-director-flow.test.ts
```

1. Run `init`, add the creative lead, and assign `creative-direction` ownership.
2. Register the supplied unknown-rights asset and import the original multiline teammate feedback.
3. Use `questions`, make a private local study, and address the rights and approval-condition blockers.
4. Clear the asset to a managed project path with the required provider scopes, resolve the condition, write a project-visible review file, promote the study, and record an explicit review by the recorded participant ID.
5. Add the required approved creative brief, research board and reference, two territories, selected visual language, and implementation handoff through the exported TypeScript artifact/workflow services. The current CLI intentionally has no artifact-authoring or stage-transition command; adapters use those exported services.
6. Advance adjacent gates from `brief` through `review` and then `handoff`; the final handoff for a new site requires creative-lead or stakeholder approval.
7. Run `validate` and reload the manifest. Errors block release; warnings retain incomplete private work for inspection.

For the agent-facing handoff context, Codex and Claude render the same approved facts, permissions, feedback, questions, and blockers; only the host label differs:

```sh
node dist/src/cli.js context --host codex --root ./website
node dist/src/cli.js context --host claude --root ./website
```

The context explicitly keeps private/provisional work out of approved facts and repeats that only an explicit review creates approval.

## Inspection and validation

```sh
node dist/src/cli.js status --root ./website
node dist/src/cli.js validate --root ./website
node dist/src/cli.js --help
```

Validation checks managed paths, private-file availability, artifact lineage, approvals, feedback targets and conditions, rights/provider boundaries, decision-owner approval, and handoff integrity. Error diagnostics set a nonzero exit code; warnings alone do not. The project manifest is saved under an exclusive lock through atomic replacement, and asset changes use a recovery journal.

On Windows, directory `fsync` is not available with the POSIX-level guarantee used elsewhere. The harness reports that accepted limitation internally and retains journal recovery; it does not claim a power-loss durability barrier for directory rename ordering on Windows. There is also one known minor: two processes simultaneously initializing a brand-new private workspace can race while creating its nested `.gitignore`. Normal operation after initialization is unaffected; avoid parallel first initialization of the same root.

## Current product boundary

This release does **not** implement Figma provider execution, automated imports from messaging/email/Figma comments, Affinity integration, or a dashboard. The `figma` scope is a policy permission for future provider work, not an integration. The harness also does not automatically synchronize external tools, publish work, or merge/push source control changes.

All creative feedback remains qualitative and evidence-based. There are no creative scores, grades, percentages, or automated taste judgments.
