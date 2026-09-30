# Creative Preproduction Harness — Design Specification

**Status:** Approved design, ready for implementation planning  
**Date:** 2026-09-16  
**Working repository name:** `creative-preproduction-harness`

## 1. Purpose

The Creative Preproduction Harness is a local-first, agent-neutral system that helps developers build creative judgment before implementing a website. It is intended especially for technically strong developers who are less experienced with visual research, composition, typography, color, identity, and the flow of a web experience.

The harness operates inside conversational coding environments such as Codex and Claude. It guides a developer from an ambiguous request through three broad stages:

1. Interpret and confirm the creative brief.
2. Research, explore, and develop a visual direction.
3. Demonstrate readiness for implementation through evidence and human review.

The harness is a creative coach, collaborator, and maker. It does not grade taste, produce a numerical design score, or replace human creative judgment.

## 2. Goals

- Teach developers to make intentional visual decisions through adaptive, reflective questions.
- Support both new website creation and updates to existing websites.
- Help teams move beyond generic, trend-driven, or recognizably AI-generated website patterns.
- Connect audience, purpose, content, typography, color, imagery, composition, motion, and responsive behavior into one transferable visual language.
- Make research analytical rather than decorative: every reference must answer a question and include a rationale.
- Produce multiple meaningful creative directions before converging on one.
- Create durable, reviewable artifacts that can be shared across a team and handed to a coding agent.
- Remain agent-neutral and creative-tool-neutral.
- Start with HTML/SVG visual exploration and deliberately grow toward deeper Figma use.
- Preserve human approval, uncertainty, rejected alternatives, and the reasoning behind changes.

## 3. Non-goals

- Automatically deciding whether a design is objectively good.
- Assigning creative scores or allowing a score to approve work.
- Replacing designers, creative leads, stakeholders, or peer critique.
- Acting as a general-purpose website builder.
- Recreating Figma, Affinity, or another creative application inside the harness.
- Making cloud storage mandatory.
- Hiding the creative process behind one-shot generation.
- Treating a polished mockup as sufficient evidence of a coherent visual direction.

## 4. Design principles

### 4.1 Coach before taking over

The harness should help developers form judgment. It asks focused questions, explains relevant principles, offers comparisons, and encourages interpretation. It generates work when generation advances exploration, but it does not silently make every consequential decision.

### 4.2 Evidence, not scores

Readiness is demonstrated through a coherent body of work, an explicit rationale, explored alternatives, resolved questions, and appropriate human approval. Checklists may detect missing information, but no numerical score represents creative quality.

### 4.3 One visual idea, expressed as a language

A direction is more than a collection of attractive choices. Typography, color, imagery, spacing, composition, motion, and content voice must reinforce a clear identity thesis.

### 4.4 Alternatives before convergence

The harness requires genuinely different creative territories. Cosmetic variations of the same layout do not count as alternatives.

### 4.5 Local source of truth

Project artifacts live alongside the website project. External tools may hold editable visual artifacts, but the local project records their locations, previews, sources, status, and rationale.

### 4.6 Portable core, replaceable integrations

The creative process is defined independently of any agent or visual tool. Codex, Claude, ChatGPT, HTML/SVG, Figma, and future Affinity support are adapters around a common protocol.

## 5. System architecture

The system has two repositories and four logical layers.

### 5.1 Harness repository

The dedicated harness repository contains:

- Agent-neutral workflow definitions
- Coaching methods and question libraries
- Artifact schemas and templates
- Review and approval rules
- Codex and Claude adapters
- A later ChatGPT adapter
- Creative-provider contracts
- HTML/SVG and Figma providers
- Validation and migration tools
- Documentation and example projects
- Harness version and change history

The first release is distributed by cloning this repository. Its internal boundaries must allow it to become an installable, versioned package later without redesigning the workflow.

### 5.2 Website repository

Each website repository contains only its own preproduction workspace:

- Brief and current-site audit, when applicable
- Research references and analyses
- Identity thesis and creative territories
- Visual-language definition
- Composition studies and previews
- Decision journal and question history
- Human feedback and approvals
- Implementation handoff
- A manifest recording the harness version and current workflow state

### 5.3 Logical layers

1. **Creative workflow core:** Defines stages, artifacts, coaching behavior, transitions, and review policy.
2. **Project state:** Stores human-readable documents and structured workflow metadata in the website repository.
3. **Agent adapters:** Present the same workflow through the conventions of Codex, Claude, and later ChatGPT.
4. **Creative providers:** Produce or register visual artifacts through HTML/SVG, Figma, manual work, or future creative tools.

### 5.4 Optional local dashboard

A lightweight local dashboard may organize the brief, references, moodboards, visual studies, feedback, and approval history. The dashboard reads project files and does not own the creative logic or canonical data. The complete workflow remains usable from an agent when the dashboard is absent.

## 6. Workflow

### 6.1 Entry and project routing

The universal entry instruction is conceptually **“start creative preproduction.”** The agent determines whether the user is:

- Starting a new website
- Updating an existing website
- Resuming an existing preproduction project

New and existing websites use different intake and diagnostic paths, then converge on shared research, visual-language, exploration, review, and handoff stages.

### 6.2 Stage 1 — Brief and diagnosis

For every project, the harness explores:

- Audience and context
- Business and communication goals
- Desired feeling and behavioral outcome
- Content priorities and available content
- Brand assets and constraints
- Stakeholder expectations
- Technical, accessibility, schedule, and asset constraints
- Observable definitions of a successful outcome

For an existing website, the harness also audits hierarchy, composition, consistency, responsiveness, usability, accessibility, content flow, and the relationship between the current design and the intended identity.

The output is an interpreted creative brief. The developer confirms that interpretation before research begins.

### 6.3 Stage 2 — Research and visual direction

The agent first creates a research plan. It then helps the developer gather and analyze references for specific questions such as:

- How might information hierarchy feel?
- What typographic voice suits the audience and content?
- How can color carry emotional and functional meaning?
- What grid, rhythm, or compositional tension supports the identity?
- How should imagery, texture, illustration, or iconography behave?
- How should the visitor move, pause, discover, and act?
- What conventions are useful, and which would make the result feel generic?

Every reference records what can be learned, what should not be copied, why it is relevant, its source, and any known licensing implications.

The harness then develops two or three genuinely distinct creative territories. Each territory includes an identity thesis, reference logic, type and color hypotheses, composition principles, imagery treatment, motion character, and an explicit description of how that direction could lapse into generic design.

Focused visual studies test the territories. The user compares them, records a rationale, and selects or combines a direction.

### 6.4 Stage 3 — Pre-build readiness and review

The selected direction becomes a visual language and composition plan. The harness translates it into responsive behavior, content priorities, component implications, accessibility expectations, implementation risks, and experiments that should continue in the browser.

Readiness requires evidence that:

- The visual identity has a clear idea and rationale.
- Typography, color, imagery, layout, motion, and content voice form a coherent language.
- Meaningful alternatives were explored.
- Decisions relate to audience and purpose rather than trend alone.
- Responsive and accessible behavior preserves creative intent.
- Reviewers can distinguish intentional choices, remaining uncertainty, and implementation hypotheses.

Review is tiered:

- Routine, low-risk work may pass after developer self-review when the evidence is complete and no material uncertainty remains.
- Material updates require peer review.
- New sites, major redesigns, disputed directions, or material uncertainty require creative-lead or stakeholder review.
- Reviewers may approve, approve with explicit conditions, or return the work to a named earlier stage.

No numerical design score is produced or used.

## 7. Adaptive creative coaching

The agent adjusts the depth and focus of coaching to the developer's demonstrated needs. Examples include:

- Typography: comparing type classifications, roles, contrast, rhythm, readability, licensing, and pairing logic.
- Color: exploring harmony, contrast, temperature, proportion, accessibility, cultural context, and emotional effect.
- Composition: testing hierarchy, density, whitespace, grid behavior, asymmetry, scale, sequencing, and responsive recomposition.
- Identity: finding a project-specific metaphor, tension, rhythm, or point of view that survives beyond the logo and copy.
- Flow: considering where visitors should orient, slow down, feel surprise, gain confidence, and take action.
- Anti-generic critique: identifying overused hero structures, interchangeable visual tropes, empty decoration, uniform section rhythms, and choices unsupported by project context.

Representative questions include:

- Does this choice make the experience more distinctive, clearer, or more emotionally appropriate?
- What visual idea belongs specifically to this organization?
- If the logo and copy disappeared, would the site retain an identifiable character?
- Which familiar patterns make this feel generically AI-generated?
- What could be exaggerated, simplified, reordered, or removed?
- Do type, color, imagery, spacing, motion, and composition express the same identity?
- What happens to the composition—not merely the stacking order—on a small screen?

The question history is preserved as part of the project record so reviewers can understand how the direction developed.

## 8. Agent interaction model

The harness exposes one primary entry instruction and resumable conceptual commands:

- `brief` — create or revisit the interpreted brief
- `audit` — analyze an existing website
- `research` — plan and analyze creative references
- `territories` — develop distinct visual directions
- `visual-language` — define the selected identity system
- `explore` — request visual studies from an available provider
- `critique` — challenge current work with reflective questions
- `handoff` — prepare frontend implementation guidance
- `review` — request, record, or respond to human feedback
- `status` — explain current state and unresolved work

These names express shared intents rather than host-specific syntax. Each agent adapter maps them to the interaction model supported by its host.

The agent may operate in three declared roles:

- **Coach:** develops the user's judgment through questions and instruction.
- **Collaborator:** proposes, compares, and refines ideas with the user.
- **Maker:** creates requested artifacts through an available provider.

The agent states a meaningful role change. This prevents it from taking over when coaching is needed and prevents excessive questioning when the user needs a concrete experiment.

## 9. Artifact model

Artifacts form a connected lineage rather than a loose collection of files.

### 9.1 Creative brief

The confirmed interpretation of audience, purpose, desired feeling, content priorities, constraints, and success.

### 9.2 Existing-site audit

For update projects, a diagnosis of the current experience with preserved strengths, problems, constraints, and opportunities.

### 9.3 Identity thesis

A concise, project-specific visual idea expressed as a metaphor, tension, rhythm, or point of view. Generic adjectives alone are insufficient.

### 9.4 Research board

Curated references grouped by the questions they answer, including analysis, source, attribution, licensing notes, adaptation opportunities, and explicit cautions against copying.

### 9.5 Creative territories

Two or three substantively different directions with coherent hypotheses across identity, typography, color, composition, imagery, motion, and responsive behavior.

### 9.6 Visual language system

The selected direction expressed through principles for typography, color relationships, spatial rhythm, grid behavior, imagery, shapes, texture, iconography, motion, content voice, and responsive composition. Tokens and components may encode these principles later but do not replace them.

### 9.7 Composition studies

Focused experiments such as hero rhythm, editorial flow, navigation behavior, typographic hierarchy, image-and-copy relationships, transitions, and responsive recomposition. They need not be polished full-page mockups.

### 9.8 Decision journal

A chronological record of alternatives, questions, feedback, rejected ideas, reversals, important decisions, and their rationale.

### 9.9 Implementation handoff

Actionable frontend guidance identifying what must remain consistent, what may adapt, which behaviors require prototyping, and which uncertainties must be tested during implementation.

## 10. Project state and versioning

The website repository is the canonical record. It stores:

- Human-readable Markdown for narrative artifacts
- Structured data for stage state, relationships, approvals, and validation
- Local previews or durable links for visual artifacts
- The harness version used to create or migrate the workspace

The normal data flow is:

**Conversation → artifact proposal → human confirmation → saved version → critique or review → next stage**

Approved directions are immutable records. Meaningful revisions create new versions and preserve their rationale and relationship to the approved version. Interrupted sessions resume from the persisted state.

Harness updates never silently rewrite an active project's artifacts. A future upgrade tool must show the intended migration and preserve a recoverable copy before applying schema changes.

## 11. Creative-provider contract

The workflow requests artifacts by creative intent rather than by tool. A provider receives:

- Artifact type and purpose
- Relevant brief, territory, and visual-language context
- Required capabilities and editable-format expectations
- Output constraints, accessibility considerations, and source requirements

Every provider returns a common record containing:

- Artifact identifier and version
- Provider and tool used
- Local preview or preview instructions
- Editable source location
- Creative rationale
- Inputs and reference lineage
- Source, attribution, and licensing metadata
- Known limitations and unresolved questions
- Review status

Initial providers are:

### 11.1 HTML/SVG provider

The baseline provider for quick, responsive, inspectable visual studies. It is available to coding agents without requiring a specialist creative integration.

### 11.2 Figma provider

The preferred long-term provider for moodboards, editable visual exploration, visual systems, composition studies, and collaborative review. Initial integration may cover a narrower set of artifact types and expand without altering the provider contract.

### 11.3 Manual provider

When the necessary creative tool is unavailable, the harness creates a clear manual assignment and records the expected artifact and return location. Manual work remains part of the same lineage and review process.

Future Affinity and other creative-tool integrations implement the same contract.

## 12. Failure handling and integrity

- Unavailable research or creative tools produce an explanation and a meaningful fallback.
- The harness never fabricates references, source metadata, font licensing, stakeholder feedback, approval, or tool success.
- Missing source or licensing information remains visibly unresolved.
- Broken external links are reported without deleting prior analysis or previews.
- Incomplete or invalid artifacts are preserved for inspection and marked as incomplete rather than silently replaced.
- Failed provider operations do not advance the workflow stage.
- Conflicting reviewer decisions remain visible and require explicit resolution.
- A dashboard failure does not prevent use through the agent interface.
- A provider failure does not invalidate the agent-neutral project record.

## 13. Validation and testing strategy

### 13.1 Workflow tests

Test new-site, existing-site, resume, backward-loop, conditional approval, rejection, and revision scenarios. Confirm that required artifacts and approval rules are respected without producing creative scores.

### 13.2 Adapter conformance tests

Run shared scenarios through Codex and Claude adapters. Confirm that both preserve workflow intent, one-question-at-a-time coaching, declared role changes, artifact lineage, and human approval boundaries.

### 13.3 Provider contract tests

Verify that HTML/SVG and Figma providers return the same required metadata, preview information, source lineage, editable location, limitations, and review state.

### 13.4 Artifact validation

Detect missing references, unsupported claims, absent attribution or licensing notes, broken links, incomplete relationships, invalid approval records, and attempts to overwrite approved work.

### 13.5 Creative scenario reviews

Use representative project briefs to examine whether the harness:

- Generates meaningfully distinct territories
- Connects decisions to audience and purpose
- Challenges generic patterns
- Preserves a coherent identity across visual dimensions
- Encourages responsive recomposition rather than simple stacking
- Teaches rather than merely generating

These are qualitative human reviews, not automated scores.

### 13.6 Developer usability trials

Observe backend-oriented developers using the harness without live intervention from a creative expert. Record where the workflow confuses them, teaches too little, over-explains, or allows the agent to take over prematurely.

## 14. Example projects

The harness repository includes two complete examples:

1. A new website moving from an ambiguous stakeholder request to an implementation handoff.
2. An existing website update beginning with an audit and preserving valuable parts of the current identity.

Examples show questions, rejected directions, critical feedback, revisions, and approval history in addition to polished outcomes.

## 15. Delivery sequence

1. Agent-neutral workflow, schemas, artifacts, and documentation in a cloneable repository.
2. Project initializer, persisted state, and artifact validation.
3. HTML/SVG provider for visual exploration.
4. Codex and Claude adapters implementing the combined conversational and stage-command model.
5. Example projects and developer usability trials.
6. Figma provider, beginning with selected artifact types and expanding toward richer editable exploration.
7. Optional local dashboard for visual organization and review.
8. Migration from a cloned repository to an installable, versioned package.
9. Additional agent adapters and creative providers, including Affinity when a viable integration is available.

## 16. Acceptance criteria for the first usable release

The first usable release is complete when:

- A teammate can clone the harness and initialize creative preproduction in a website repository.
- Both new-site and existing-site workflows are supported.
- Codex and Claude can conduct the shared workflow without host-specific project data.
- The workflow produces the connected artifact set defined in this specification.
- HTML/SVG composition studies can be created, previewed, versioned, and reviewed.
- Figma is represented by a working provider for at least one visual-exploration artifact type, while HTML/SVG remains a fallback.
- Tiered human approval is persisted without numerical design scores.
- Approved artifacts cannot be silently overwritten.
- Interrupted work can resume from the local project state.
- Reference sources and known licensing status are retained.
- At least one backend-oriented developer can complete a representative workflow and explain the visual rationale behind the resulting direction.

