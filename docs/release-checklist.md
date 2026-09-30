# Release 0.3.0 checklist

This is a reviewable development release. Keep `private: true`. GitHub visibility changes and npm publication require a later, explicit decision.

## Local release candidate

- [ ] `package.json`, package-lock root, CLI `--version`, and newly initialized manifest all report 0.3.0.
- [ ] `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke` pass.
- [ ] Production `dist/` contains source modules/declarations/maps, without tests or Vitest configuration; a stale build is cleaned safely.
- [ ] Smoke uses the compiled CLI as subprocesses in disposable directories and completes both `new-site` and `existing-site` handoffs.
- [ ] Manually walk through [explicit commands](tutorials/explicit-cli.md) and [guided mode](tutorials/guided.md), including a cancelled save and a resumed project.
- [ ] Confirm the Node 22.12.0/24 × Ubuntu/macOS/Windows CI matrix passes on the release commit; local success is not cross-platform evidence.
- [ ] Check v1 backup/migration and existing v2 compatibility, lock recovery, contained file paths, missing references, immutable history, and named-owner review coverage.
- [ ] Independently review the complete branch and address findings.

## Content and rights

- [ ] MIT license names Carlos Ochoa, 2026; retain dependency/third-party notices.
- [ ] Examples are fictional and original. No client assets, credentials, private feedback, or third-party copied artwork enter Git history.
- [ ] Tutorials separate saving, submission, explicit human review, and stage advancement. Demo reviews are labelled simulations.
- [ ] README accurately describes local adapters/provider scopes and current product boundaries.
- [ ] Changelog and contribution/security/reporting guidance match the release.

## Review and later publication

- [ ] Open the requested private-repository pull request with validation evidence and remaining limitations. Do not merge automatically.
- [ ] After human release approval, separately decide tag/release creation, repository visibility, and distribution. None is authorized by this checklist.
- [ ] Keep npm publishing disabled while `private: true`; do not change it as part of this release preparation.
