# Creative Preproduction Harness

Creative Preproduction Harness 0.3.0 is a local, agent-neutral CLI for a website team's creative direction. It connects a brief, research, alternative territories, visual language, supplied assets, ordinary feedback, private explorations, explicit human decisions, and an implementation handoff. Readiness comes from evidence, permissions, resolved conditions, and named reviews of exact versions.

The coordinator can help a developer form a provisional direction, partner with a creative lead, or expand supplied work. Creative judgments stay qualitative. The harness records decisions and makes bounded local studies; it does not score taste or authenticate reviewers.

## Start locally

Requires Node.js **22.12.0 or newer** and npm. CI targets Node 22.12.0 and 24 on Linux, macOS, and Windows.

```sh
git clone https://github.com/ochoac-dev/creative-preproduction-harness.git
cd creative-preproduction-harness
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
npm run cli -- --help
```

The production build cleans `dist/` and compiles source only; type checking also covers tests. `npm run cli --` runs `node dist/src/cli.js`. The package remains `private: true`; this release preparation does not publish to npm or change GitHub visibility.

Start a guided terminal session in a website directory:

```sh
npm run cli -- guide --root ./website
```

The guide initializes or resumes the project, shows stage-aware actions, drafts Markdown from your answers or imports an existing file, and asks for confirmation before each save. Submission, review, and stage advancement are separate actions. It needs an interactive terminal; scripts can use explicit commands.

For a complete disposable demo, follow [explicit CLI commands](docs/tutorials/explicit-cli.md) or the [guided workflow](docs/tutorials/guided.md). The [Harbor Lantern example](examples/harbor-lantern/README.md) contains original fictional documents, an SVG, and an HTML composition. `npm run smoke` runs the compiled CLI through both project kinds in temporary roots, with clearly simulated example reviews.

## Explicit team workflow

Initialize, register the people involved, and name consequential decision owners:

```sh
npm run cli -- init --root ./website --id workshop --name "Workshop website" --kind new-site
npm run cli -- participant add --root ./website --id creative-lead --name "Creative lead" --role creative-lead
npm run cli -- participant own --root ./website --area creative-direction --participant creative-lead
```

Owner areas are `creative-direction`, `business-direction`, and `implementation-readiness`. Named creative-direction owners must explicitly review the consequential territory/visual-language decisions and condition-bound composition work. A review tier alone cannot replace the named participant.

Write your document first, register it, submit it, and record the human decision only after the reviewer actually makes it:

```sh
npm run cli -- artifact add --root ./website --id brief --kind creative-brief --path docs/brief-v1.md --rationale "Sets the audience and desired action."
npm run cli -- artifact submit --root ./website --id brief --version 1
npm run cli -- review --root ./website --artifact brief --version 1 --tier creative-lead --decision approved --reviewer "Creative lead" --reviewer-id creative-lead --reason "The reviewer explicitly approved this version."
npm run cli -- stage check --root ./website --to research
npm run cli -- stage advance --root ./website --to research
```

These commands illustrate the API, not authorization to approve real work on another person's behalf. Choose the actual reviewer/tier/decision/reason. Positive feedback, saved files, condition resolution, and submission do not create formal approval.

The adjacent stage sequence is:

`brief → research → territories → visual-language → exploration → review → handoff`

Gates require an approved brief; approved research plus a reference; two territories with a selected approved direction; approved visual language; a composition in review or approved; and a policy-compliant approved handoff. New-site handoffs need creative-lead or stakeholder approval. Existing-site handoffs need peer or higher. Public stage commands move one stage forward at a time and preserve saved history. `stage check` explains blockers without advancing.

Use distinct files for revisions. Registration validates existing project files and referenced assets. Approved versions and review history remain preserved; later work gets a new version:

```sh
npm run cli -- artifact revise --root ./website --id brief --version 1 --path docs/brief-v2.md --rationale "Clarifies mobile priorities."
npm run cli -- artifact list --root ./website
npm run cli -- artifact show --root ./website --id brief --version 2
```

`--version` on `revise` identifies the current parent, which must be the latest version. On submit/show/review, it identifies the exact target. `artifact add` accepts repeated `--asset` IDs. Research references record URL, title, relevance, lesson, what to avoid copying, attribution, license status, and license notes through `reference add`; `reference list` inspects them. Reference registration stores metadata without fetching a URL.

## Assets, feedback, and private work

Assets record source, intended role, modification permission, rights, provider scopes, treatments, responsive guidance, and accessibility intent. Cleared assets use managed project-relative paths. Unknown-rights imports use opaque private references and are limited to private local HTML/SVG studies. Clearing rights requires a managed file and explicit permitted scopes; changing a metadata label is not legal permission.

Import ordinary feedback using `feedback import --message` or `--file`. The original wording remains separate from interpretation and classification. `questions` collects open questions and conditions; `feedback resolve` records the responsible person's response. No chat/email service is connected.

`explore-private` writes a provisional HTML/SVG study below `.creative-preproduction/private/`, with a nested ignore rule. Ignoring a directory does not encrypt it or restrict operating-system access. Private provisional work cannot be approved or satisfy a gate. `promote` registers a separate prepared project-visible file as a new draft with lineage; it preserves the private source. Submit and explicitly review the promoted version afterward. Unknown rights, private asset storage, missing references, provider restrictions, and open conditions can block promotion or handoff.

The [explicit tutorial](docs/tutorials/explicit-cli.md) exercises the whole asset/feedback/private-study/promotion cycle. The guide offers those same operations through confirmed menu actions.

## Inspection, context, and compatibility

```sh
npm run cli -- status --root ./website
npm run cli -- validate --root ./website
npm run cli -- context --host codex --root ./website
npm run cli -- context --host claude --root ./website
```

Codex and Claude adapters render the same approved facts, permissions, feedback, questions, and blockers with different host labels. They generate context text for you to use; they do not invoke agents, AI APIs, Figma, messaging, or cloud providers. The `figma` provider scope is a policy permission for potential future integrations, not a live connector. This release has no Affinity integration, dashboard, automatic external import, publishing, or source-control merge/push action.

Validation errors set a nonzero exit code; warnings alone do not. Expected failures are concise; use `npm run cli -- --debug <command> ...` for diagnostic detail. Manifests are atomically replaced under owner-aware locks, and asset updates use recovery journals. Use `npm run cli -- doctor --root ./website` to inspect lock ownership and manifest state. `doctor --recover-lock` releases only a provably dead owner on the same host, after rechecking its identity; it refuses live, remote-host, uncertain, or legacy owner metadata. If a recovery marker remains after interruption, or ownership cannot be established, stop writers, preserve a backup, and investigate manually before changing lock files. Lock age alone never proves recovery is safe. On Windows, directory fsync cannot provide the same directory-rename durability barrier as on POSIX systems.

See [workspace recovery](docs/troubleshooting.md) for the manual procedure for legacy empty locks and uncertain recovery markers.

New projects use schema version 2. For a version-1 workspace:

```sh
npm run cli -- migrate --root ./website
```

Migration preserves artifacts, approvals, references, questions, and stage, adds empty v2 collaboration collections, and saves the original bytes to `.creative-preproduction/manifest.json.v1.backup`. It refuses to overwrite an existing backup. Keep backups and approved files intact.

## Contributing and license

See [contribution guidance](CONTRIBUTING.md), [security reporting](SECURITY.md), [changelog](CHANGELOG.md), and [release checklist](docs/release-checklist.md).

Repository code and original examples are [MIT licensed](LICENSE), copyright 2026 Carlos Ochoa. Dependencies and imported third-party materials retain their own licenses, notices, and permission requirements; the repository license does not clear outside assets.
