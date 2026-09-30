import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeProject } from "../../src/services/initializer.js";

describe("initializeProject", () => {
  it("creates a readable new-site workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    const manifest = await initializeProject({
      root,
      id: "civic-arts",
      name: "Civic Arts",
      kind: "new-site",
      now: new Date("2026-09-16T18:00:00Z")
    });

    expect(manifest).toMatchObject({
      schemaVersion: 2,
      participants: [],
      decisionOwners: [],
      assets: [],
      feedback: []
    });
    expect(manifest.stage).toBe("brief");
    expect(await readFile(join(root, ".creative-preproduction", "brief.md"), "utf8")).toContain("Audience");
    expect(await readFile(join(root, ".creative-preproduction", "asset-dossier.md"), "utf8"))
      .toContain("Asset Dossier");
    const privateRoot = join(root, ".creative-preproduction", "private");
    expect(await readFile(join(privateRoot, ".gitignore"), "utf8")).toBe("*\n!.gitignore\n");
    expect(await readdir(privateRoot)).toEqual([".gitignore"]);
  });

  it("includes an audit section for an existing site", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));

    await initializeProject({
      root,
      id: "civic-arts",
      name: "Civic Arts",
      kind: "existing-site",
      now: new Date("2026-09-16T18:00:00Z")
    });

    expect(await readFile(join(root, ".creative-preproduction", "existing-site-audit.md"), "utf8"))
      .toContain("Preserved strengths");
  });

  it("does not replace an initialized workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));
    const options = {
      root,
      id: "civic-arts",
      name: "Civic Arts",
      kind: "new-site" as const,
      now: new Date("2026-09-16T18:00:00Z")
    };

    await initializeProject(options);

    await expect(initializeProject({ ...options, name: "Different Civic Arts" }))
      .rejects.toThrow("already initialized");
  });

  it("writes a complete validated manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "creative-preproduction-"));

    const manifest = await initializeProject({
      root,
      id: "civic-arts",
      name: "Civic Arts",
      kind: "new-site",
      now: new Date("2026-09-16T18:00:00Z")
    });

    expect(JSON.parse(await readFile(join(root, ".creative-preproduction", "manifest.json"), "utf8")))
      .toEqual(manifest);
  });
});
