import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface HarnessPackageInfo {
  root: string;
  version: string;
}

export async function findHarnessPackage(): Promise<HarnessPackageInfo> {
  let candidate = dirname(fileURLToPath(import.meta.url));

  while (true) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(candidate, "package.json"), "utf8"));
      if (
        typeof parsed === "object" && parsed !== null
        && "name" in parsed && parsed.name === "creative-preproduction-harness"
        && "version" in parsed && typeof parsed.version === "string"
      ) {
        return { root: candidate, version: parsed.version };
      }
    } catch {
      // This directory is not a readable package root; continue upward.
    }

    const parent = dirname(candidate);
    if (parent === candidate) {
      throw new Error("Could not locate the creative-preproduction-harness package root");
    }
    candidate = parent;
  }
}
