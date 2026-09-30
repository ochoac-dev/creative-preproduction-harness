# Creative-Director Collaboration Extension — Design Specification

**Status:** Approved in conversation; pending written-spec review

**Date:** 2026-09-17

**Extends:** `2026-09-16-creative-preproduction-harness-design.md`

## 1. Summary

This specification extends the Creative Preproduction Harness with a creative-direction layer for developers. The layer acts as the connective intelligence across the existing coach, collaborator, and maker roles. It helps developers interpret creative intent, ask stronger questions, analyze supplied assets, explore visual directions, organize feedback, and preserve an approved direction through implementation.

The harness does not impersonate or replace a human creative lead. When a creative person is involved, it supports that person as an active collaborator and preserves their decision authority. When no creative person is available, it gives the developer deeper guidance and creates provisional recommendations, while consequential decisions still require explicit human approval.

The extension reuses the current local manifest, artifact lineage, versioning, workflow gates, provider contract, validation system, and tiered approvals. It adds first-class supplied assets, imported feedback, creative ownership, private provisional exploration, and stricter explicit-approval semantics.

## 2. Research basis

The design follows four findings from the supporting research:

- Creative direction is the throughline connecting brand, strategy, content, design, and technology. It includes interpreting briefs, establishing direction, communicating rationale, guiding contributors, and maintaining quality and consistency.
- Designers and developers should be co-owners of the experience. Developers benefit when critique and handoff communicate why constraints exist, not only what to build.
- Web art direction includes responsive changes to crop, proportion, and sometimes image choice. It is not limited to resizing the same asset.
- The accessibility treatment of an image depends on its purpose in context: informative, functional, decorative, complex, or an image of text.

Reference material:

- AIGA, “Creative Director”: https://designcareers.aiga.org/job/creative-director-0218
- Nielsen Norman Group, “From Confrontation to Collaboration: The Developer-Designer Relationship”: https://www.nngroup.com/articles/developer-designer-relationship/
- web.dev, “Serve responsive images”: https://web.dev/articles/serve-responsive-images
- W3C Web Accessibility Initiative, “Images Tutorial”: https://www.w3.org/WAI/tutorials/images/

## 3. Goals

- Give backend-oriented developers access to creative-director reasoning without hiding that reasoning behind one-shot generation.
- Help developers understand how audience, purpose, content, imagery, typography, color, composition, motion, and responsive behavior form one visual language.
- Support developer-led projects, creative-led projects, and projects beginning with supplied visual assets.
- Treat supplied imagery as creative evidence that can shape the experience, not as decoration inserted into a generic template.
- Preserve the original wording of ordinary notes and messages while turning them into traceable questions, actions, constraints, conditions, and decisions.
- Allow private local exploration to continue while feedback or rights questions remain unresolved.
- Require explicit, artifact-version-specific approval before a major direction advances.
- Prevent unknown-rights assets and provisional work from reaching cloud providers, final handoff, or publication.

## 4. Non-goals

- Replacing a human creative director, designer, artist, photographer, or stakeholder.
- Converting casual positive feedback into formal approval.
- Automatically deciding that a visual direction is objectively good.
- Producing a numerical creative score.
- Uploading private or rights-uncertain assets to Figma or another external service.
- Building a messaging, email, or Figma-comment synchronization system in this release.
- Recreating image-editing or design software inside the harness.
- Automatically modifying supplied creative work without recorded permission.

## 5. Architectural approach

Creative direction is implemented as behavior in the workflow core, not as a separate agent or isolated workflow stage. Agent adapters expose the same behavior through Codex, Claude, and future hosts. Creative providers remain responsible for producing or registering studies; they do not decide creative authority or workflow readiness.

The extension consists of five bounded components:

1. **Creative-direction coordinator:** Selects the appropriate posture, asks questions, connects evidence, and routes consequential decisions to people.
2. **Asset dossier:** Records supplied assets, ownership, purpose, permissions, rights, visual observations, and usage guidance.
3. **Feedback inbox:** Preserves imported notes and organizes them without replacing the source wording.
4. **Private exploration space:** Stores provisional local studies that cannot enter production or external providers.
5. **Approval and promotion policy:** Controls when provisional or reviewed work may become a normal draft, approved artifact, or implementation handoff.

The canonical flow is:

**Supplied assets and notes → interpreted creative context → questions and private explorations → organized human feedback → explicit approval → implementation handoff**

## 6. People, authority, and collaboration

### 6.1 Participant responsibilities

- **Creative person:** Supplies intent, assets, constraints, feedback, and explicit decisions about consequential visual changes.
- **Developer:** Explores implementation possibilities, identifies technical constraints, and builds the approved direction.
- **Harness:** Coaches, organizes, translates, compares, critiques, and produces requested studies. It never fabricates human authority.
- **Stakeholder:** Confirms business intent and provides stakeholder approval where the project policy requires it.

### 6.2 Decision owners

The project records an optional human creative lead and the decision owners for major creative direction, business direction, and implementation readiness. Existing approval tiers remain intact, but a project may additionally require a named role for an artifact type.

When a human creative lead is registered, major visual direction and material treatment of that person’s supplied assets require their explicit approval unless the project records a deliberate authority change. A higher tier does not silently substitute for a required named decision owner.

When no creative lead is registered, the harness may recommend a direction, but the configured stakeholder or other human decision owner supplies the final approval.

A consequential creative decision is one that changes the identity thesis, selected territory, visual-language rules, primary campaign or hero imagery, a supplied asset beyond its recorded permission, or a condition attached to final handoff. Routine implementation choices made within approved rules do not require a new creative approval. If the boundary is unclear, the harness records the question and treats the work as provisional until the decision owner responds.

### 6.3 Question routing

The harness asks focused questions directly when the appropriate person is participating. When that person is unavailable, it produces a concise question packet for the developer to relay through ordinary communication. Returned notes or messages are imported through the feedback inbox.

Answered questions are not repeatedly asked. Unresolved questions remain visible and follow the artifact or asset they affect.

## 7. Creative-direction behavior

The coordinator operates in three compatible postures:

- **Lead posture:** Used when no creative person is available. The harness guides the developer toward a coherent provisional direction while keeping final authority human.
- **Partner posture:** Used when a creative person is involved. The harness helps develop questions, alternatives, and implementation implications without overriding the creative lead.
- **Expansion posture:** Used when visual assets or prior direction already exist. The harness derives composition and system hypotheses from those inputs instead of beginning with a generic template.

Expansion posture can coexist with either lead or partner posture. The harness declares meaningful posture changes so the developer knows whether it is teaching, proposing, producing, critiquing, or interpreting another person’s work.

### 7.1 Coaching and questioning

Questions should develop judgment and advance the current decision. Representative questions include:

- What idea makes this experience specific to the organization?
- What should the visitor notice, feel, understand, and do first?
- Which qualities in the supplied imagery should the surrounding experience amplify?
- Which asset treatments are intentional, and which would damage the direction?
- Does this composition respond to the imagery or merely place it inside a familiar template?
- What changes on smaller screens besides stacking sections?
- Which choices feel interchangeable with a generic AI-generated website?

### 7.2 Critique

Critique is evidence-based and non-numerical. The harness compares work against the approved identity thesis, asset guidance, visual-language artifact, and recorded decisions. It identifies specific relationships among imagery, type, color, spacing, hierarchy, motion, content, and responsive behavior. It separates creative concerns, technical defects, accessibility problems, and personal preferences.

When multiple interpretations are viable, the harness proposes contrasting experiments and explains what each would test. It does not present taste as an objective score.

## 8. Supplied-asset model

Each supplied asset has a structured record with:

- Stable asset identifier and title
- Creator, source, and creative owner when known
- Managed project-relative path or private storage reference
- Intended experiential role
- Modification policy: `locked`, `adaptable`, or `inspiration-only`
- Rights status: `cleared`, `restricted`, or `unknown`
- Permitted and prohibited treatments
- Visual observations, including focal point, negative space, palette, lighting, texture, geometry, tone, and rhythm when relevant
- Responsive art-direction guidance
- Accessibility intent
- Related artifacts, feedback, questions, and approval conditions
- Creation and update timestamps

The human-readable `asset-dossier` artifact explains how the asset set should influence the wider visual language. Analysis creates hypotheses; it does not automatically extract a palette and declare it the website theme.

### 8.1 Modification policy

- `locked`: The asset may be placed as permitted but not altered without a new explicit decision.
- `adaptable`: Only recorded treatments are allowed. Crop, mask, overlay, retouch, recolor, motion, or derivative creation are separate permissions rather than assumptions.
- `inspiration-only`: The asset informs direction but is not used in deliverables.

### 8.2 Rights policy

- `cleared`: The asset may be used within the documented permissions and provider scopes.
- `restricted`: The asset may be used only within its recorded restrictions. Cloud use is blocked unless explicitly permitted.
- `unknown`: The asset is limited to private local mockups. It cannot be promoted, handed off, published, or sent to an external provider.

## 9. Feedback inbox

The first release accepts ordinary notes or messages pasted or supplied to an agent adapter. It does not require a Figma, chat, or email connection.

Every feedback record preserves:

- The original message unchanged
- Author and date when known
- A human-readable source description
- Target asset or artifact version when known
- Harness classification
- Harness interpretation
- Resulting action, question, condition, or conflict
- Resolution state and links to resulting revisions

Feedback classifications are:

- `question`
- `requested-change`
- `creative-direction`
- `constraint`
- `suggestion`
- `approval-condition`
- `unresolved-conflict`
- `positive-feedback`

The harness may summarize or group feedback, but the original wording remains inspectable. Unknown authorship, unclear targets, ambiguous intent, and conflicting messages remain unresolved rather than being guessed.

Positive statements such as “looks good” or “I like this” are recorded as positive feedback. They never become an approval record. Formal approval requires a separate explicit approval action naming the artifact and version.

## 10. Private provisional exploration

The artifact status model gains `provisional`. A provisional artifact records:

- The question or hypothesis being tested
- Assumptions used
- Assets, feedback, and artifact versions used as inputs
- Rights and approval blockers
- Local preview or preview instructions
- Known limitations

Provisional artifacts cannot be approved directly, satisfy a workflow gate, enter an implementation handoff, or be published. Promotion creates a new normal draft record with explicit lineage back to the provisional source.

Private source files live under a generated `.creative-preproduction/private/` workspace whose contents are excluded from version control by a nested ignore rule. Managed filenames use generated identifiers instead of leaking original source filenames into tracked metadata. Private asset contents never enter the manifest.

Unknown-rights assets may be referenced only by local HTML/SVG studies in this private space. They cannot be sent to Figma, another cloud provider, or an externally hosted preview. If the private source disappears, validation warns and preserves the surrounding project record.

## 11. Feedback and approval loop

The working loop is:

1. Ask one focused question or prepare a small question packet.
2. Record the response or import ordinary notes.
3. Preserve the source text and organize its implications.
4. Create or revise a provisional exploration when useful.
5. Compare new feedback with the explored alternatives.
6. Explain what changed, what remains open, and who owns the next decision.
7. Request explicit approval for the exact artifact and version.
8. Advance only when workflow, rights, conditions, and decision-owner requirements are satisfied.

Formal approval records continue to contain the named reviewer, tier, decision, rationale, and exact artifact version. They additionally respect configured decision-owner requirements. Imported feedback can create an approval condition, but only an explicit approval action can create `approved`.

## 12. Provider policy

The workflow requests a study by creative intent, and providers remain replaceable.

- **HTML/SVG:** Default provider for fast, responsive, inspectable, local studies. It is the only initial provider permitted to use unknown-rights assets, and then only in the private workspace.
- **Figma:** Available for cleared assets and collaboration-ready studies when the user has chosen it. Unknown-rights assets and locally restricted assets are blocked before provider invocation.
- **Manual:** Creates a clear assignment and return location for work performed in Affinity or another unavailable tool. Returned work follows the same asset, feedback, versioning, and approval rules.

Provider failure does not change project stage or approval state. A provider cannot relax rights, privacy, or decision-owner policy.

## 13. Agent interaction intents

The shared agent-neutral interaction model gains these conceptual intents:

- `assets` — register, inspect, or revise supplied-asset metadata
- `feedback` — import, inspect, organize, or resolve notes
- `questions` — show unresolved questions or prepare a relay packet
- `explore-private` — create a provisional local study
- `promote` — turn an eligible provisional study into a normal draft with lineage

These are shared intents, not required literal CLI syntax. Codex and Claude adapters map them to host-appropriate interactions. The core services remain usable independently of an adapter.

## 14. Validation and failure handling

Validation adds diagnostics for:

- Missing asset modification policy
- Unknown or restricted rights affecting a requested use
- Private assets referenced by non-private artifacts
- Provisional work referenced by a handoff
- Feedback without a clear target
- Unresolved approval conditions or conflicts
- Feedback incorrectly represented as approval
- Approval attached to the wrong artifact version
- Missing required decision-owner approval
- Restricted or unknown assets requested by a disallowed provider
- Missing private source files
- Unsafe absolute-path or original-filename exposure in tracked metadata

Unknown authorship or a missing feedback target is normally a warning and remains unresolved. Rights, privacy, provider-scope, explicit-approval, and handoff-integrity violations are errors that block promotion or advancement. Validation preserves incomplete work for inspection and never silently deletes or rewrites it.

## 15. Compatibility and migration

The extension requires a manifest schema-version increase. A compatibility reader can inspect an older project and report that migration is required, but extension-specific mutations are disabled until migration succeeds. A migration initializes empty participant, asset, and feedback collections and does not change existing artifacts, approvals, references, or stages.

Adding `provisional` to artifact status does not change the meaning of existing `draft`, `in-review`, `approved`, or `superseded` records. Existing approval history remains immutable. A project is migrated only through an explicit operation that shows the target version and preserves a recoverable pre-migration copy, following the foundation’s migration policy.

## 16. Testing strategy

### 16.1 Schema and service tests

- Participant and decision-owner records
- Asset permissions, rights, and provider scopes
- Feedback preservation and classification
- Provisional artifact creation and promotion
- Rejection of direct approval for provisional artifacts
- Compatibility with existing manifests

### 16.2 Workflow and validation tests

- Unknown-rights assets allowed in private local exploration
- Unknown-rights assets blocked from Figma, handoff, and publication
- Restricted assets following explicit provider limitations
- Casual feedback never creating approval
- Named decision-owner requirements
- Conflicting and ambiguous feedback
- Missing private files without manifest corruption
- Promotion creating a new draft with lineage

### 16.3 Adapter conformance tests

Codex and Claude run the same scenarios and must preserve:

- Declared creative-direction posture
- Focused questioning and question history
- Original imported feedback
- Asset permissions and privacy boundaries
- Provisional status and promotion rules
- Explicit, version-bound human approval

### 16.4 Scenario reviews

Use at least three end-to-end scenarios:

1. A developer-led website with no available creative lead.
2. A creative-led website where ordinary messages drive revisions.
3. A supplied-image project with unknown rights, private experiments, later clearance, promotion, and approval.

Qualitative review verifies that a backend-oriented developer can explain the resulting creative rationale and the boundaries of supplied assets. It does not assign a creative score.

## 17. Acceptance criteria for the extension release

The extension is usable when a teammate can:

1. Initialize or resume a project without breaking existing foundation data.
2. Register a creative lead and decision owners.
3. Register supplied assets with modification and rights policies.
4. Import ordinary notes or messages while preserving their original wording.
5. Receive organized actions, questions, conditions, and conflicts.
6. Produce a private local HTML/SVG exploration.
7. Continue provisional work while awaiting feedback.
8. Prevent unknown-rights content from leaving the private local workflow.
9. Promote an eligible exploration into a versioned draft with lineage.
10. Record explicit, named, version-specific creative approval.
11. Produce an implementation handoff that excludes provisional, restricted, unresolved, or unapproved material.

Figma integration may follow this release or be implemented in parallel for cleared assets, but the creative-direction, asset, feedback, private exploration, and approval workflow must function without Figma.

## 18. Relationship to the current MVP

The current repository remains a foundation MVP. It already provides storage, workflow stages, artifact revision, approval history, validation, and the `init`, `status`, and `validate` commands. This specification defines the next product slice needed to turn that foundation into a developer-facing creative-director collaboration workflow.

Implementation planning should decompose the work into independently verifiable increments: schema and migration, asset services, feedback services, private provisional artifacts, policy-aware validation, agent-neutral coaching behavior, HTML/SVG private exploration, and adapter integration.
