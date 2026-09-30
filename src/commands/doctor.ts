import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AnyProjectManifestSchema } from "../domain/schema.js";
import { findHarnessPackage } from "../services/package-info.js";
import { inspectManifestLock, recoverManifestLock } from "../storage/manifest-lock.js";

const templateNames = ["brief.md", "decision-journal.md", "research-board.md", "asset-dossier.md"] as const;

async function diagnoseInstallation(): Promise<void> {
  try {
    const harness = await findHarnessPackage();
    const metadata = JSON.parse(await readFile(join(harness.root, "package.json"), "utf8")) as { engines?: { node?: string } };
    const requirement = metadata.engines?.node ?? "unavailable";
    process.stdout.write(`Harness ${harness.version}: ${harness.root}\n`);
    process.stdout.write(`Node ${process.version} (required ${requirement})\n`);
    const unavailable: string[] = [];
    const templates = await Promise.allSettled(templateNames.map((name) => readFile(join(harness.root, "templates", name), "utf8")));
    for (let index = 0; index < templates.length; index += 1) {
      if (templates[index]?.status === "rejected") unavailable.push(templateNames[index]!);
    }
    if (unavailable.length > 0) {
      process.stdout.write(`Templates unavailable: ${unavailable.join(", ")}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`Templates available: ${templateNames.join(", ")}\n`);
  } catch (error: unknown) {
    process.stdout.write(`Installation unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export function registerDoctorCommand(program: Command): void {
  program.command("doctor")
    .description("Inspect project state and explicitly recover a provably dead local writer")
    .option("--root <path>", "website repository", ".")
    .option("--recover-lock", "recover a manifest lock only when its local owner is proven dead")
    .action(async (options) => {
      await diagnoseInstallation();
      const manifestPath = join(resolve(options.root), ".creative-preproduction", "manifest.json");
      if (options.recoverLock) {
        const recovered = await recoverManifestLock(manifestPath);
        process.stdout.write(recovered ? "Recovered manifest lock from a dead local writer.\n" : "No manifest lock needed recovery.\n");
      }
      const lock = await inspectManifestLock(manifestPath);
      process.stdout.write(`Lock ${lock.state}: ${lock.message}\n`);
      if (lock.state === "dead") process.stdout.write("Run doctor --recover-lock with this project root to release it explicitly.\n");
      if (lock.state !== "unlocked") process.exitCode = 1;
      try {
        const manifest = AnyProjectManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
        process.stdout.write(`Manifest schema ${manifest.schemaVersion}: ${manifest.project.name} (${manifest.stage}).\n`);
      } catch (error: unknown) {
        process.stdout.write(`Manifest unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
    });
}
