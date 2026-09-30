# Complete terminal-guided walkthrough

Guided mode is a terminal interface over the same local services as explicit commands. It initializes or resumes a root, presents actions appropriate to the stage, summarizes changes, and asks **Save this action? [y/N]** before saving. Drafting, importing, submitting, recording a review, and advancing are distinct actions.

Use an interactive terminal with Node 22.12.0 or newer. If stdin/stdout are redirected or a TTY is unavailable, use the [explicit CLI tutorial](explicit-cli.md). You can inspect `npm run cli -- guide --help` without opening the guide.

This walkthrough uses the fictional Harbor Lantern example. All participants, feedback, and approvals are invented. Record simulated approvals only inside the disposable demo. In a real project, use the actual reviewer and obtain their explicit decision before recording it.

## Prepare the disposable root

Run `npm ci` and `npm run build`, then perform the platform-specific copy setup in [step 1 of the explicit tutorial](explicit-cli.md#1-install-build-and-copy-original-materials). It copies the original example to `demo/` and editable starter templates to `working-templates/` inside a fresh temporary directory.

Launch the guide from the repository root:

```sh
npm run cli -- guide --root "$DEMO"
```

In PowerShell, `$DEMO` is the variable from the Windows setup. If the manifest is absent, the initialization wizard asks for project ID, name, and kind. Use `harbor-lantern`, `Harbor Lantern demo`, and `new-site`; inspect the initialization summary before confirming. The guide writes schema-v2 state below `.creative-preproduction/`.

For an existing-site run, use a second fresh root and select `existing-site`. Import `demo/artifacts/existing-site-audit.md` as an `existing-site-audit` artifact; inspect the supplied audit and replace fictional claims for real work. The rest of the workflow is the same, with a peer-or-higher handoff threshold.

The menu is numbered and stage-aware. Select by the displayed label rather than relying on numbers in this tutorial. Invalid input explains what is missing. Exit and relaunch with the same root to resume saved state. Declining a save preserves already saved work. Type `:cancel` or `:quit`, or press Ctrl+C, to exit the current session before confirming; saved actions remain available on resume.

## People, ownership, and assets

Use **Add participant** with ID `mina-vale`, name `Mina Vale (fictional)`, role `creative-lead`. Confirm the summary. Use **Assign decision owner** separately for `creative-direction` and `implementation-readiness`, selecting `mina-vale` each time.

Use **Add asset** with:

| Field | Demo value |
| --- | --- |
| ID/title | `lantern` / Original lantern emblem |
| Source and attribution | Carlos Ochoa, original repository example, MIT 2026 |
| Intended visual role | Welcoming workshop identity |
| Modification/rights | `adaptable` / `unknown` initially |
| Input path | Absolute path to `$DEMO/demo/assets/lantern.svg` |
| Provider | `local-html-svg` |
| Allowed/prohibited treatment | Responsive proportional scaling / distortion |
| Responsive/accessibility guidance | Scale without clipping; visit information first / Original lantern above blue waves |

The demo deliberately starts with unknown rights to exercise the private boundary. Unknown rights means private storage; verify the selected rights and input path in the summary. Confirm it. For real assets, enter the actual permission evidence rather than following these fictional labels.

Use **Import feedback** to import the original file `$DEMO/demo/feedback.txt`. Set ID `mobile-condition`, source `Fictional example feedback`, author `Mina Vale (fictional)`, class `approval-condition`, interpretation `Confirm visit action before the long story on mobile`, target kind `asset`, target ID `lantern`. Confirm the summary. The original words remain separate from your interpretation; they do not approve a document.

## Private study, clearance, and promotion

Choose **Create private study** with ID `lantern-study`, title `Quiet workbench study`, question `Can practical information lead a welcoming page?`, asset `lantern`, rationale `Explore privately before clearing the demo asset`, assumption `Fictional local demo only`, and note `Protect quiet space; put visit information first`. Confirm the summary and inspect the reported local preview.

The study is private provisional v1. Unknown rights block promotion. After checking the example's original authorship and MIT license, choose **Update asset rights or storage** for `lantern`, set rights `cleared`, managed path `demo/assets/lantern.svg`, and permitted scopes `local-html-svg` and `manual`. Review and confirm. This is a metadata record of actual clearance evidence in real projects, not a permission generator.

Choose **Resolve feedback** for `mobile-condition`. Record `Fictional lead confirms visit action precedes the story in the authored mobile composition` and resulting artifact `lantern-study`. Confirm separately.

Choose **Promote study** for `lantern-study` version `1`, destination `demo/artifacts/composition-v2.html`, and rationale `Original cleared demo is ready for explicit review`. Inspect that project-visible HTML file before saving. Promotion registers a prepared separate file as draft v2 and preserves private v1; it does not approve it or automatically publish/copy the private preview.

## Draft or import the brief, then handle review explicitly

To try drafting, choose **Draft document**, kind `creative-brief`, ID `creative-brief`, and a rationale. The guide generates `.creative-preproduction/artifacts/creative-brief-v1.md`; it does not ask you to choose a draft destination. Answer the prompts using the example brief:

| Prompt topic | Answer |
| --- | --- |
| Audience | Neighbors arranging a first visit, repair, or class |
| Purpose/action | Make opening hours, access, and visit action easy to find |
| Feeling | Warm, useful, quietly inventive |
| Priorities | Visit action, hours/access, classes, repair service, story |
| Brand and stakeholder constraints | Preserve the original lantern; no borrowed artwork |
| Technical and accessibility constraints | Native fonts, no tracking, semantic headings and visible focus |
| Success evidence | Test whether people find visit information on phone and desktop |

The guide writes Markdown from your answers; blank answers appear as `[Unanswered]`. A saved draft is not evidence that missing answers or creative questions are resolved. Review the summary, enter `n` once to practice cancelling, then repeat and confirm when satisfied.

Alternatively, use **Import existing document** to register `demo/artifacts/brief-v1.md` as `creative-brief`. The existing file stays project-relative; importing registers it rather than generating answers. Use only one of these routes for the same artifact ID.

Choose **Submit for review** for `creative-brief` v1. Confirm. Then choose **Record review**, selecting the same ID/version, tier `creative-lead`, decision `approved`, reviewer `Mina Vale (fictional)`, reviewer ID `mina-vale`, and reason `SIMULATED: fictional lead approves this exact demo brief`. Inspect the exact-version review summary before confirming. Formal review always remains a separate action; the guide never infers it from feedback or advances afterward.

For revision practice, choose **Revise document** from current parent v1, with distinct existing file `demo/artifacts/brief-v2.md` and rationale `Clarifies mobile visit priority`. Confirm the new draft v2, then separately submit v2 and record its fictional review. Approved v1 and its file stay preserved. Future revisions use the latest parent and a new path.

Choose **Advance stage**, target `research`. The menu shows known prerequisites and the action summarizes the selected target. After confirmation, gate and file validation run before the transition is saved. If blocked, finish the stated prerequisites and retry. No save/review action automatically changes the stage.

## Research and territories

Choose **Add reference** and record:

- ID `original-lantern-study`, URL `https://example.invalid/harbor-lantern/study`, title `Original local lantern study`.
- Relevance `Welcoming workshop with practical navigation`; lesson `Quiet space protects a clear visit action`.
- Avoid copying `No unrelated brand, image, or typeface permission is implied`.
- Attribution `Carlos Ochoa, original repository example, 2026`; license status `verified`; notes `Original MIT example; URL is a fictional label, not a fetched source`.

Confirm the summary. Registration stores metadata and does not visit the URL. Real research needs accurate sources and honest rights notes.

Use **Import existing document** for `research-board`, kind `research-board`, path `demo/artifacts/research-board.md`, rationale `Records source, lesson, and limits`. Submit it, then separately record its fictional lead approval. Choose **Advance stage** to `territories` and confirm.

Import both territories using their distinct IDs/files:

| ID | Kind | File | Rationale |
| --- | --- | --- | --- |
| `territory-a` | `creative-territory` | `demo/artifacts/territory-a.md` | Quiet invitation prioritizes a first visit |
| `territory-b` | `creative-territory` | `demo/artifacts/territory-b.md` | Noticeboard provides a denser alternative |

Submit and explicitly review `territory-a` v1 with creative-lead tier, approved decision, and named owner `mina-vale`. Leave territory B as a draft alternative. Advance separately to `visual-language`. The gate needs two territories and an approved selection; it does not require approving every option.

## Visual language, composition, and handoff

Import `visual-language`, kind `visual-language`, path `demo/artifacts/visual-language.md`, rationale `Defines selected palette, type, and behavior`, asset ID `lantern`. Submit v1, then explicitly record its fictional owner approval. Advance to `exploration`.

Submit promoted `lantern-study` v2 for review. Advance separately to `review`; a composition in review satisfies this gate. Record the fictional lead's approved review of exact v2, with reviewer ID `mina-vale`. Private v1 remains history and cannot authorize implementation.

Import `implementation-handoff`, kind `implementation-handoff`, path `demo/artifacts/implementation-handoff.md`, rationale `Packages inspected direction and implementation checks`, asset ID `lantern`. Submit v1. Record the fictional readiness owner's creative-lead review of exact v1. Inspect the handoff references, managed permissions, and implementation checks, then confirm the simulated review.

Choose **Advance stage** to `handoff`. Blockers may include open conditions, missing references, private/unknown asset use, unmet provider scopes, or missing owner approval. Resolve them through their specific actions. New sites require creative-lead or stakeholder handoff review; existing sites require peer or higher, plus any named readiness owner.

Choose **Validate project** and inspect diagnostics. Errors block completion; warnings alone do not. Choose **Render agent context** with `codex` or `claude` to see approved information and unresolved matters as local context text. The adapters do not call agents, APIs, Figma, or cloud services.

Exit and resume once to verify the saved `handoff` state. Delete only the temporary fictional root after inspection. Its simulated records must never enter a real project's approval history.
