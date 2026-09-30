import { Option, type Command } from "commander";
import { resolve } from "node:path";
import { ArtifactKindSchema, type ArtifactRecord, type ProjectManifest } from "../domain/schema.js";
import { addProjectArtifact, reviseProjectArtifact, submitProjectArtifact } from "../services/workflow-actions.js";
import { ProjectStore } from "../storage/project-store.js";

function collect(value: string, values: string[] = []): string[] {
  return [...values, value];
}

function artifactDetail(manifest: ProjectManifest, artifact: ArtifactRecord) {
  return {
    artifact,
    reviews: manifest.approvals.filter((approval) => approval.artifactId === artifact.id && approval.artifactVersion === artifact.version)
  };
}

export function registerArtifactCommands(program: Command): void {
  const artifact = program.command("artifact").description("Register, revise, submit, and inspect project artifacts");

  artifact.command("add")
    .description("Register an existing project file as a first draft")
    .requiredOption("--id <id>", "artifact identity")
    .addOption(new Option("--kind <kind>", "artifact kind").choices(ArtifactKindSchema.options).makeOptionMandatory())
    .requiredOption("--path <path>", "existing project-relative file")
    .requiredOption("--rationale <text>", "why this artifact matters")
    .option("--asset <id>", "linked asset; repeat for additional assets", collect, [])
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      await addProjectArtifact(new ProjectStore(resolve(options.root)), {
        id: options.id, kind: options.kind, path: options.path, rationale: options.rationale, assetIds: options.asset
      });
      process.stdout.write(`Added artifact ${options.id} v1 as a draft.\n`);
    });

  artifact.command("revise")
    .description("Create a new draft from the exact latest artifact version")
    .requiredOption("--id <id>", "artifact identity")
    .requiredOption("--version <number>", "exact latest version to revise")
    .requiredOption("--path <path>", "different existing project-relative file")
    .requiredOption("--rationale <text>", "why the artifact changed")
    .option("--asset <id>", "replacement asset list; repeat for additional assets", collect)
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const version = Number(options.version);
      await reviseProjectArtifact(new ProjectStore(resolve(options.root)), {
        id: options.id, version, path: options.path, rationale: options.rationale,
        ...(options.asset === undefined ? {} : { assetIds: options.asset })
      });
      process.stdout.write(`Revised artifact ${options.id} to v${version + 1} as a draft.\n`);
    });

  artifact.command("submit")
    .description("Submit an exact latest draft for review")
    .requiredOption("--id <id>", "artifact identity")
    .requiredOption("--version <number>", "exact latest draft version")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      await submitProjectArtifact(new ProjectStore(resolve(options.root)), { id: options.id, version: Number(options.version) });
      process.stdout.write(`Submitted artifact ${options.id} v${options.version} for review.\n`);
    });

  artifact.command("list")
    .description("List all artifact versions and their review metadata")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const manifest = await new ProjectStore(resolve(options.root)).load();
      process.stdout.write(`${JSON.stringify(manifest.artifacts.map((record) => artifactDetail(manifest, record)), null, 2)}\n`);
    });

  artifact.command("show")
    .description("Show the metadata and reviews for one exact artifact version")
    .requiredOption("--id <id>", "artifact identity")
    .requiredOption("--version <number>", "exact artifact version")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const version = Number(options.version);
      if (!Number.isSafeInteger(version) || version < 1) throw new Error("Artifact version must be a positive integer.");
      const manifest = await new ProjectStore(resolve(options.root)).load();
      const record = manifest.artifacts.find((candidate) => candidate.id === options.id && candidate.version === version);
      if (record === undefined) throw new Error(`Artifact ${options.id} v${version} does not exist.`);
      process.stdout.write(`${JSON.stringify(artifactDetail(manifest, record), null, 2)}\n`);
    });
}
