import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import { initializeProject } from "../../src/services/initializer.js";
import { ProjectStore } from "../../src/storage/project-store.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "creative-managed-assets-"));
  roots.push(root);
  await initializeProject({ root, id: "safe-files", name: "Safe Files", kind: "new-site" });
  return root;
}

async function run(...args: string[]): Promise<void> {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await createProgram().exitOverride().parseAsync(["node", "creative-preproduction", ...args]);
}

function add(root: string, id: string, path: string, rights = "cleared"): string[] {
  return ["asset", "add", "--root", root, "--id", id, "--title", "Supplied illustration",
    "--source", "Original example", "--role", "Lead image", "--modification", "adaptable",
    "--rights", rights, "--path", path, "--provider", "local-html-svg",
    "--responsive", "Scale without cropping", "--accessibility", "Illustration of a lantern"];
}

describe("managed asset file checks", () => {
  it.each(["missing", "directory"])("rejects a %s file on add and update without changing records", async (kind) => {
    const root = await projectRoot();
    const path = "invalid.svg";
    if (kind === "directory") await mkdir(join(root, path));
    const store = new ProjectStore(root);
    const before = await store.load();
    await expect(run(...add(root, "invalid", path))).rejects.toThrow();
    expect(await store.load()).toEqual(before);
    await writeFile(join(root, "valid.svg"), "<svg/>");
    await run(...add(root, "valid", "valid.svg"));
    const added = await store.load();
    await expect(run("asset", "update", "--root", root, "--id", "valid", "--path", path)).rejects.toThrow();
    expect(await store.load()).toEqual(added);
  });

  it("rejects private source hardlinks before clearing rights or adding a managed alias", async () => {
    const root = await projectRoot();
    await writeFile(join(root, "original.svg"), "private marker");
    await run(...add(root, "private-image", join(root, "original.svg"), "unknown"));
    const source = join(root, ".creative-preproduction/private/assets/private-image/source");
    await link(source, join(root, "alias.svg"));
    const store = new ProjectStore(root);
    const before = await store.load();
    await expect(run("asset", "update", "--root", root, "--id", "private-image",
      "--rights", "cleared", "--path", "alias.svg")).rejects.toThrow(/private source|hard link/i);
    await expect(run(...add(root, "managed-alias", "alias.svg"))).rejects.toThrow(/private source|hard link/i);
    expect(await store.load()).toEqual(before);
    expect(await readFile(source, "utf8")).toBe("private marker");
  });

  it("accepts a separate managed copy and keeps the original private bytes", async () => {
    const root = await projectRoot();
    await writeFile(join(root, "original.svg"), "supplied bytes");
    await run(...add(root, "image", join(root, "original.svg"), "unknown"));
    await writeFile(join(root, "managed.svg"), "supplied bytes");
    await run("asset", "update", "--root", root, "--id", "image", "--rights", "cleared", "--path", "managed.svg");
    expect((await new ProjectStore(root).load()).assets[0]).toMatchObject({
      rightsStatus: "cleared", storage: { kind: "managed", path: "managed.svg" }
    });
    expect(await readFile(join(root, ".creative-preproduction/private/assets/image/source"), "utf8"))
      .toBe("supplied bytes");
  });
});
