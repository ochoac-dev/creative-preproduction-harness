import type { Command } from "commander";
import { resolve } from "node:path";
import type { AssetStorage } from "../domain/schema.js";
import { addAsset, assertManagedAssetLocation, createAsset, updateAsset } from "../services/assets.js";
import { PrivateWorkspace } from "../storage/private-workspace.js";
import { ProjectStore } from "../storage/project-store.js";
import { assertManifestProjectArtifactFile } from "../storage/artifact-file.js";

function collect(value: string, values: string[] = []): string[] {
  return [...values, value];
}

export function registerAssetCommands(program: Command): void {
  const asset = program.command("asset").description("Manage supplied creative assets");

  asset.command("add")
    .requiredOption("--id <slug>")
    .requiredOption("--title <title>")
    .requiredOption("--source <description>")
    .requiredOption("--role <description>")
    .requiredOption("--modification <policy>")
    .requiredOption("--rights <status>")
    .requiredOption("--path <path>")
    .requiredOption("--responsive <guidance>")
    .requiredOption("--accessibility <intent>")
    .option("--creator <name>")
    .option("--owner <participant-id>")
    .option("--provider <scope>", "permitted provider scope", collect, [])
    .option("--allow <treatment>", "allowed treatment", collect, [])
    .option("--prohibit <treatment>", "prohibited treatment", collect, [])
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const root = resolve(options.root);
      const store = new ProjectStore(root);
      const storage: AssetStorage = options.rights === "unknown"
        ? { kind: "private", ref: options.id }
        : { kind: "managed", path: options.path };
      const created = createAsset({
        id: options.id,
        title: options.title,
        ...(options.creator === undefined ? {} : { creator: options.creator }),
        source: options.source,
        ...(options.owner === undefined ? {} : { creativeOwner: options.owner }),
        intendedRole: options.role,
        modificationPolicy: options.modification,
        rightsStatus: options.rights,
        providerScopes: options.provider,
        storage,
        allowedTreatments: options.allow,
        prohibitedTreatments: options.prohibit,
        visualNotes: {},
        responsiveGuidance: options.responsive,
        accessibilityIntent: options.accessibility,
        unresolvedQuestions: []
      });
      const workspace = options.rights === "unknown" ? new PrivateWorkspace(root) : undefined;
      let imported = false;
      await store.mutateAssets(async (manifest) => {
        if (created.storage.kind === "managed") {
          await assertManagedAssetLocation(root, created.storage.path);
          await assertManifestProjectArtifactFile(root, manifest, created.storage.path);
        }
        const updated = addAsset(manifest, created);
        if (workspace) {
          if (manifest.assets.some((asset) => asset.storage.kind === "private" && asset.storage.ref === options.id)) {
            throw new Error(`Private reference ${options.id} already exists in the manifest.`);
          }
          await workspace.initialize();
          const publication = await workspace.importFile(options.id, resolve(options.path));
          imported = publication.ownership === "created";
        }
        return updated;
      }, async () => {
        if (imported) await workspace?.removeImportedFile(options.id);
      });
      process.stdout.write(`Added asset ${options.id}.\n`);
    });

  asset.command("update")
    .requiredOption("--id <slug>")
    .option("--rights <status>")
    .option("--provider <scope>", "permitted provider scope", collect)
    .option("--path <path>")
    .option("--root <path>", "website repository", ".")
    .action(async (options) => {
      const root = resolve(options.root);
      const store = new ProjectStore(root);
      await store.mutateAssets(async (manifest) => {
        const current = manifest.assets.find((candidate) => candidate.id === options.id);
        if (current === undefined) {
          throw new Error(`Asset ${options.id} does not exist.`);
        }
        if (current.rightsStatus === "unknown" && options.rights !== undefined && options.rights !== "unknown" && options.path === undefined) {
          throw new Error("Changing an unknown-rights asset requires a managed --path.");
        }
        const updated = updateAsset(manifest, options.id, {
          ...(options.rights === undefined ? {} : { rightsStatus: options.rights }),
          ...(options.provider === undefined ? {} : { providerScopes: options.provider }),
          ...(options.path === undefined ? {} : { storage: { kind: "managed", path: options.path } })
        });
        const storage = updated.assets.find((candidate) => candidate.id === options.id)!.storage;
        if (storage.kind === "managed") {
          await assertManagedAssetLocation(root, storage.path);
          // Check the current manifest before a rights change replaces its private reference.
          await assertManifestProjectArtifactFile(root, manifest, storage.path);
        }
        return updated;
      });
      process.stdout.write(`Updated asset ${options.id}.\n`);
    });
}
