# Complete explicit CLI walkthrough

This walkthrough creates a disposable **fictional** Harbor Lantern project. Mina Vale and the feedback are invented. The `review` commands below simulate approvals inside this demo only; never run simulated review commands against a real project. For real work, record a decision only after the named person explicitly gives it.

No TypeScript code or service API is needed. The copy steps use Node's filesystem tools; every project operation uses the compiled CLI. Run from the repository root with Node 22.12.0 or newer.

## 1. Install, build, and copy original materials

```sh
npm ci
npm run build
```

POSIX terminal setup:

```sh
DEMO=$(node -e "process.stdout.write(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'harbor-lantern-demo-')))")
node --input-type=module -e "import {cp} from 'node:fs/promises'; await cp('examples/harbor-lantern',process.argv[1]+'/demo',{recursive:true}); await cp('templates',process.argv[1]+'/working-templates',{recursive:true});" "$DEMO"
cph() { npm run cli -- "$@" --root "$DEMO"; }
```

PowerShell setup for Windows:

```powershell
$DEMO = node -e "process.stdout.write(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'harbor-lantern-demo-')))"
node --input-type=module -e "import {cp} from 'node:fs/promises'; await cp('examples/harbor-lantern',process.argv[1]+'/demo',{recursive:true}); await cp('templates',process.argv[1]+'/working-templates',{recursive:true});" $DEMO
function cph { npm run cli -- @args --root $DEMO }
```

The command blocks below use single-line `cph` invocations and work with either wrapper. The demo path is outside the repository; keep it available for inspecting HTML/documents. The original example and copied templates remain editable, but registered approved versions must remain untouched.

## 2. Initialize and assign the fictional lead

```sh
cph init --id harbor-lantern --name "Harbor Lantern demo" --kind new-site
cph participant add --id mina-vale --name "Mina Vale (fictional)" --role creative-lead
cph participant own --area creative-direction --participant mina-vale
cph participant own --area implementation-readiness --participant mina-vale
cph status
cph stage check --to research
```

The final check is expected to fail because no brief is approved yet. Read the blocker; checks do not save a transition. For an existing-site demo, initialize a fresh disposable root with `--kind existing-site`, and register `demo/artifacts/existing-site-audit.md` as kind `existing-site-audit` before research. The same lead reviews below satisfy both handoff thresholds.

## 3. Capture source permission, original feedback, and a private study

We deliberately start the original SVG as unknown rights to exercise the private boundary, then clear it using its documented MIT source. Unknown assets take an input file path from the terminal; managed/approved paths are relative to the project root.

```sh
cph asset add --id lantern --title "Original lantern emblem" --creator "Carlos Ochoa" --source "Original repository example, MIT 2026" --owner mina-vale --role "Welcoming workshop identity" --modification adaptable --rights unknown --path "$DEMO/demo/assets/lantern.svg" --provider local-html-svg --allow "responsive proportional scaling" --prohibit "distortion" --responsive "Scale without clipping; show visit information first." --accessibility "Original lantern above blue waves."
cph feedback import --id mobile-condition --file "$DEMO/demo/feedback.txt" --source "Fictional example feedback" --author "Mina Vale (fictional)" --class approval-condition --interpretation "Confirm visit action before the long story on mobile." --target-kind asset --target-id lantern
cph questions
cph explore-private --id lantern-study --title "Quiet workbench study" --question "Can practical information lead a welcoming page?" --rationale "Test privately before clearing the demo asset." --asset lantern --assumption "Fictional local demo only." --note "Protect quiet space; put visit information first."
```

Open the reported private `index.html` locally and inspect it. It is marked provisional; it is not an approved website. The original feedback file is preserved verbatim in the manifest. Attempting promotion now is expected to fail:

```sh
cph promote --artifact lantern-study --version 1 --path demo/artifacts/composition-v2.html --rationale "Demonstrate the rights blocker."
```

The example's README and MIT license establish its original source. Clear the asset to the copied managed path, resolve the fictional condition, and promote the already authored, separate composition file:

```sh
cph asset update --id lantern --rights cleared --path demo/assets/lantern.svg --provider local-html-svg --provider manual
cph feedback resolve --id mobile-condition --resolution "Fictional lead confirms the visit action precedes the story in the authored mobile composition." --artifact lantern-study
cph promote --artifact lantern-study --version 1 --path demo/artifacts/composition-v2.html --rationale "Original cleared demo is ready for explicit review."
```

Promotion creates draft `lantern-study` v2 and preserves private v1. It neither copies the private HTML automatically nor approves anything. The sample project-visible composition uses the managed SVG and must be inspected separately.

## 4. Register, submit, explicitly review, and revise the brief

```sh
cph artifact add --id creative-brief --kind creative-brief --path demo/artifacts/brief-v1.md --rationale "Defines the audience and first visit."
cph artifact submit --id creative-brief --version 1
cph review --artifact creative-brief --version 1 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional lead approves demo brief v1."
cph artifact revise --id creative-brief --version 1 --path demo/artifacts/brief-v2.md --rationale "Makes mobile visit priority explicit."
cph artifact submit --id creative-brief --version 2
cph review --artifact creative-brief --version 2 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional lead approves demo brief v2."
cph artifact show --id creative-brief --version 1
cph artifact show --id creative-brief --version 2
cph stage check --to research
cph stage advance --to research
```

The old file, version, and review remain available. `revise --version 1` selects the latest parent, then creates v2 at a distinct file path. For another change, write a v3 file and revise from v2. Review decisions are `approved`, `approved-with-conditions`, or `returned`; a conditional review keeps work in review and does not satisfy an approved gate.

## 5. Research and two distinct territories

The reference is an original local study. Its `example.invalid` URL is a fictional label; registration does not fetch it or claim it is a live page. Real references need their real source and honest license status.

```sh
cph reference add --id original-lantern-study --url https://example.invalid/harbor-lantern/study --title "Original local lantern study" --relevance "Welcoming workshop with practical navigation." --lesson "Quiet space protects a clear visit action." --avoid-copying "No unrelated brand, image, or typeface permission is implied." --attribution "Carlos Ochoa, original repository example, 2026" --license-status verified --license-notes "Original MIT example; URL is a fictional label, not a fetched source."
cph reference list
cph artifact add --id research-board --kind research-board --path demo/artifacts/research-board.md --rationale "Records source, lesson, and limits."
cph artifact submit --id research-board --version 1
cph review --artifact research-board --version 1 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional lead approves the original research."
cph stage check --to territories
cph stage advance --to territories
cph artifact add --id territory-a --kind creative-territory --path demo/artifacts/territory-a.md --rationale "Quiet invitation prioritizes a first visit."
cph artifact add --id territory-b --kind creative-territory --path demo/artifacts/territory-b.md --rationale "Noticeboard offers a distinct denser alternative."
cph artifact submit --id territory-a --version 1
cph review --artifact territory-a --version 1 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional owner selects Quiet workbench."
cph stage check --to visual-language
cph stage advance --to visual-language
```

Territory B stays a documented draft. The gate requires two territories and at least one approved selection, not approval of every alternative. The named owner's ID belongs on the selected direction's review.

## 6. Visual language and composition review

```sh
cph artifact add --id visual-language --kind visual-language --path demo/artifacts/visual-language.md --rationale "Defines the selected palette, type, and behavior." --asset lantern
cph artifact submit --id visual-language --version 1
cph review --artifact visual-language --version 1 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional owner approves selected visual language."
cph stage check --to exploration
cph stage advance --to exploration
cph artifact submit --id lantern-study --version 2
cph stage check --to review
cph stage advance --to review
cph review --artifact lantern-study --version 2 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional lead explicitly approves promoted composition v2."
```

A submitted composition is sufficient to enter the review stage. Review of its exact promoted version is a separate decision. Private v1 remains private and cannot be used as an approval substitute.

## 7. Review the handoff, then advance and validate

```sh
cph artifact add --id implementation-handoff --kind implementation-handoff --path demo/artifacts/implementation-handoff.md --rationale "Packages inspected direction and implementation checks." --asset lantern
cph artifact submit --id implementation-handoff --version 1
cph review --artifact implementation-handoff --version 1 --tier creative-lead --decision approved --reviewer "Mina Vale (fictional)" --reviewer-id mina-vale --reason "SIMULATED: fictional readiness owner approves exact handoff v1."
cph stage check --to handoff
cph stage advance --to handoff
cph validate
cph status
cph artifact list
cph context --host codex
cph context --host claude
```

The final status is `handoff`. New-site handoff needs creative-lead or stakeholder approval; existing-site handoff needs peer or higher. A named implementation-readiness owner still must review. Context commands render local text for the named host; they call no external API. Validation errors block completion; warnings retain inspectable incomplete private history.

After inspection, remove only this generated temporary demo root using your file manager. Do not reuse its simulated approval records for real work. `npm run smoke` repeats this workflow automatically for both project kinds and deletes its own temporary roots.
