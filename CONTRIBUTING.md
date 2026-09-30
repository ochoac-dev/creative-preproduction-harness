# Contributing

Use Node.js 22.12.0 or newer. CI runs Node 22.12.0 and 24 on Linux, macOS, and Windows.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
```

Work in a branch and open a pull request with the problem, resulting behavior, and relevant validation. Add focused regression coverage for behavioral fixes. Build output is generated and should not be committed. Production compilation includes `src/`; type checking also includes tests and Vitest configuration.

Windows case-insensitive path tests run only on Windows and are skipped on Linux/macOS. The POSIX file-permission test is skipped on Windows and when running as root, where its permission-denial assumption does not apply. File-symlink tests require an environment that permits creating symlinks; GitHub's hosted runners exercise them in the release matrix.

Keep saved schema-v2 projects compatible. Preserve artifact versions, review records, original feedback, and schema-v1 migration backups. Use shared services from both explicit commands and guided mode; do not bypass path, rights, decision-owner, or workflow checks. Expected command failures should explain how to recover. All approval actions must identify a person, exact artifact version, tier, decision, and reason.

Use original or clearly licensed examples. Record source, permission, attribution, and provider scope for imported assets; do not place client material in fixtures or issue reports. Do not replace third-party copyright or license notices. Project code and original repository examples are MIT licensed; dependencies retain their own terms.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md). For ordinary bugs, include a minimal fictional reproduction, OS/Node version, command, expected result, and redacted output. External provider execution, automatic messaging imports, and publishing require separate design work; do not add them implicitly.
