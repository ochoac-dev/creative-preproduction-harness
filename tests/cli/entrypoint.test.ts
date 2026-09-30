import { mkdtemp, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createProgram, isDirectExecution } from "../../src/cli.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("recognizes the executable when invoked through an npm-style symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-cli-link-")); roots.push(root);
  const file = join(root, "cli.js"), link = join(root, "creative-preproduction");
  await writeFile(file, "// executable fixture");
  await symlink(file, link, "file");
  expect(isDirectExecution(pathToFileURL(file).href, link)).toBe(true);
});

it("reports the actual package version", async () => {
  const metadata = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(createProgram().version()).toBe(metadata.version);
});
