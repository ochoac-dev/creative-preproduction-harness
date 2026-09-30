import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const cli = join(repo, "dist", "src", "cli.js");
const pkg = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
assert.equal(pkg.version, "0.3.0");
assert.equal(pkg.private, true, "Release preparation must keep npm publishing disabled.");
assert.equal(pkg.license, "MIT");
const buildEntries = await readdir(join(repo, "dist"));
assert(!buildEntries.includes("tests"), "Production build must exclude tests.");
assert(!buildEntries.some((entry) => entry.startsWith("vitest.config")), "Production build must exclude Vitest config.");

function invoke(args, { root, failure = false } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args, ...(root ? ["--root", root] : [])], {
    cwd: repo, encoding: "utf8", timeout: 30_000, windowsHide: true
  });
  assert.ifError(result.error);
  if (failure) assert.notEqual(result.status, 0, `Expected a blocked action: ${args.join(" ")}`);
  else assert.equal(result.status, 0, `CLI failed: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}
assert.equal(invoke(["--version"]).trim(), pkg.version);
assert.match(invoke(["--help"]), /guide/);

const entryRoot = await mkdtemp(join(tmpdir(), "creative-preproduction-entry-"));
try {
  const linkedCli = join(entryRoot, "creative-preproduction.mjs");
  await symlink(cli, linkedCli, "file");
  for (const args of [["--version"], ["--help"]]) {
    const result = spawnSync(process.execPath, [linkedCli, ...args], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, args[0] === "--version" ? /0\.3\.0/ : /guide/);
  }
  assert.match(invoke(["guide"], { root: entryRoot }), /interactive terminal|explicit commands/i);
  assert.deepEqual(await readdir(entryRoot), ["creative-preproduction.mjs"], "Noninteractive guide must not initialize state.");
  assert.match(invoke(["status"], { root: entryRoot, failure: true }), /init/);
} finally {
  await rm(entryRoot, { recursive: true, force: true });
}

for (const kind of ["new-site", "existing-site"]) {
  const root = await mkdtemp(join(tmpdir(), `creative-preproduction-${kind}-`));
  try {
    // Every mutation below targets a disposable fictional project. These reviews
    // simulate Mina Vale's decisions; they never act on a real person's project.
    const run = (args, options = {}) => invoke(args, { root, ...options });
    await cp(join(repo, "examples", "harbor-lantern"), join(root, "demo"), { recursive: true });
    await cp(join(repo, "templates"), join(root, "working-templates"), { recursive: true });
    run(["init", "--id", "harbor-lantern", "--name", "Harbor Lantern demo", "--kind", kind]);
    run(["participant", "add", "--id", "mina-vale", "--name", "Mina Vale (fictional)", "--role", "creative-lead"]);
    run(["participant", "own", "--area", "creative-direction", "--participant", "mina-vale"]);
    run(["participant", "own", "--area", "implementation-readiness", "--participant", "mina-vale"]);
    run(["stage", "check", "--to", "handoff"], { failure: true });
    run(["stage", "advance", "--to", "research"], { failure: true });

    run(["asset", "add", "--id", "lantern", "--title", "Original lantern emblem", "--creator", "Carlos Ochoa",
      "--source", "Original repository example, MIT 2026", "--owner", "mina-vale", "--role", "Welcoming workshop identity",
      "--modification", "adaptable", "--rights", "unknown", "--path", join(root, "demo", "assets", "lantern.svg"),
      "--provider", "local-html-svg", "--allow", "responsive proportional scaling", "--prohibit", "distortion",
      "--responsive", "Scale without clipping; keep visit information first.", "--accessibility", "Original lantern above blue waves."]);
    run(["feedback", "import", "--id", "mobile-condition", "--file", join(root, "demo", "feedback.txt"),
      "--source", "Fictional example feedback", "--author", "Mina Vale (fictional)", "--class", "approval-condition",
      "--interpretation", "Confirm visit action before long story on mobile.", "--target-kind", "asset", "--target-id", "lantern"]);
    assert.match(run(["questions"]), /mobile-condition/);
    run(["explore-private", "--id", "lantern-study", "--title", "Quiet workbench study", "--question", "Can practical information lead a welcoming page?",
      "--rationale", "Explore privately before clearing the demo asset.", "--asset", "lantern", "--assumption", "Fictional local demo only.",
      "--note", "Protect quiet space and put visit information first."]);
    run(["promote", "--artifact", "lantern-study", "--version", "1", "--path", "demo/artifacts/composition-v2.html", "--rationale", "Still blocked by unknown rights."], { failure: true });
    run(["asset", "update", "--id", "lantern", "--rights", "cleared", "--path", "demo/assets/lantern.svg", "--provider", "local-html-svg", "--provider", "manual"]);
    run(["feedback", "resolve", "--id", "mobile-condition", "--resolution", "Fictional lead confirms visit action comes first in the authored composition.", "--artifact", "lantern-study"]);
    run(["promote", "--artifact", "lantern-study", "--version", "1", "--path", "demo/artifacts/composition-v2.html", "--rationale", "Original cleared demo is ready for explicit review."]);

    const submit = (id, version = 1) => run(["artifact", "submit", "--id", id, "--version", String(version)]);
    const review = (id, version = 1) => run(["review", "--artifact", id, "--version", String(version), "--tier", "creative-lead", "--decision", "approved",
      "--reviewer", "Mina Vale (fictional)", "--reviewer-id", "mina-vale", "--reason", "SIMULATED: fictional lead approves this exact demo version."]);
    const add = (id, artifactKind, path, { approve = true, asset = false } = {}) => {
      run(["artifact", "add", "--id", id, "--kind", artifactKind, "--path", `demo/artifacts/${path}`, "--rationale", "Original fictional project evidence.", ...(asset ? ["--asset", "lantern"] : [])]);
      if (approve) { submit(id); review(id); }
    };
    const advance = (to) => { run(["stage", "check", "--to", to]); run(["stage", "advance", "--to", to]); };
    add("creative-brief", "creative-brief", "brief-v1.md");
    const briefOne = await readFile(join(root, "demo", "artifacts", "brief-v1.md"), "utf8");
    run(["artifact", "revise", "--id", "creative-brief", "--version", "1", "--path", "demo/artifacts/brief-v2.md", "--rationale", "Prioritize the mobile visit action."]);
    submit("creative-brief", 2); review("creative-brief", 2);
    assert.equal(await readFile(join(root, "demo", "artifacts", "brief-v1.md"), "utf8"), briefOne);
    if (kind === "existing-site") add("existing-audit", "existing-site-audit", "existing-site-audit.md");
    advance("research");
    run(["reference", "add", "--id", "original-lantern-study", "--url", "https://example.invalid/harbor-lantern/study", "--title", "Original local lantern study",
      "--relevance", "Welcoming workshop with practical navigation.", "--lesson", "Quiet space protects a clear visit action.", "--avoid-copying", "No unrelated brand, image, or typeface permission is implied.",
      "--attribution", "Carlos Ochoa, original repository example, 2026", "--license-status", "verified", "--license-notes", "Original example is MIT licensed; URL is a fictional label, not a fetched source."]);
    assert.match(run(["reference", "list"]), /original-lantern-study/);
    add("research-board", "research-board", "research-board.md");
    advance("territories");
    add("territory-a", "creative-territory", "territory-a.md");
    add("territory-b", "creative-territory", "territory-b.md", { approve: false });
    advance("visual-language");
    add("visual-language", "visual-language", "visual-language.md", { asset: true });
    advance("exploration");
    submit("lantern-study", 2); review("lantern-study", 2);
    advance("review");
    add("implementation-handoff", "implementation-handoff", "implementation-handoff.md", { asset: true });
    advance("handoff");
    assert.match(run(["artifact", "list"]), /creative-brief/);
    assert.match(run(["artifact", "show", "--id", "creative-brief", "--version", "2"]), /creative-brief/);
    assert.match(run(["status"]), /handoff/);
    run(["validate"]);
    assert.match(run(["context", "--host", "codex"]), /Harbor Lantern/);
    assert.match(run(["context", "--host", "claude"]), /Harbor Lantern/);

    const manifest = JSON.parse(await readFile(join(root, ".creative-preproduction", "manifest.json"), "utf8"));
    assert.equal(manifest.harnessVersion, pkg.version);
    assert.equal(manifest.stage, "handoff");
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.project.kind, kind);
    assert.equal(manifest.feedback[0].originalText, await readFile(join(root, "demo", "feedback.txt"), "utf8"));
    assert.equal(manifest.feedback[0].resolutionStatus, "resolved");
    const original = manifest.artifacts.find((item) => item.id === "creative-brief" && item.version === 1);
    assert.equal(original.status, "approved");
    const provisional = manifest.artifacts.find((item) => item.id === "lantern-study" && item.version === 1);
    assert.equal(provisional.visibility, "private");
    assert.equal(provisional.status, "provisional");
    assert.match(await readFile(join(root, provisional.path), "utf8"), /PRIVATE PROVISIONAL STUDY/);
    assert((await lstat(join(root, "demo", "assets", "lantern.svg"))).isFile());
    assert.equal(manifest.artifacts.find((item) => item.id === "lantern-study" && item.version === 2).parentVersion, 1);
    assert.equal(manifest.approvals.find((item) => item.artifactId === "implementation-handoff").reviewerId, "mina-vale");
    console.log(`Smoke passed: ${kind}, explicit owner review, version history, local rights workflow, approved handoff.`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
