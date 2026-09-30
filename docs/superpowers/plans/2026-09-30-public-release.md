# Public Release 0.3.0 Implementation Plan

Goal: complete local CLI and guided creative-team workflows, fix reproduced reliability defects, and prepare an MIT-licensed GitHub release. User approved this plan on September 30, 2026. GitHub visibility and npm publication are deferred.

Architecture: shared project services enforce path, reference, and approval rules; explicit commands and built-in-terminal guided mode call those services. Keep schema v2 compatible and preserve approval/artifact history. Build with TypeScript/Node >=22.12.0; no AI service dependency.

- [ ] Reliability: canonical executable detection/version metadata; owner-aware locks and explicit safe recovery; canonical promotion/registration/validation paths; blocking missing references and checked legacy handoff references; friendly expected errors with --debug.
- [ ] Workflow: artifact add/revise/submit/list/show; reference add/list; adjacent stage check/advance. File/asset validation before saving, exact latest revision, immutable approved versions.
- [ ] Guidance: guide --root initializes/resumes, participants/owners, stage-aware menu; draft Markdown from answers or import; assets/feedback/private-study/promotion/review operations; summary and confirmation before each save; explicit separate approval and transition; cancel current unconfirmed action, preserve saved actions; non-TTY instructions.
- [ ] Release materials: original fictional example; full explicit and guided tutorials; MIT, contribution/security/issue templates/changelog; 0.3.0 package and lock; production-only compilation; keep package private.
- [ ] Verification: regressions before fixes; existing v1 migration/v2 projects; new/existing site handoffs; actual CLI fresh-checkout walkthrough. GitHub Actions Linux/macOS/Windows x Node22.12.0/24, install/typecheck/tests/build/smoke.
- [ ] Delivery: independent whole-branch review, fix findings, tested reviewable pull request. Do not merge or change visibility.

Rulings: work in the task-owned import checkout on feature branch feat/public-release-0.3; original Downloads directory remains untouched. Implementation tasks may be delegated with disjoint file ownership; root integrates and verifies shared interfaces.
