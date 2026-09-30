import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { migrateManifest } from "../domain/migration.js";
import { renderAssetDossier } from "../services/asset-dossier.js";
import { AnyProjectManifestSchema, ProjectManifestSchema, type AnyProjectManifest, type ProjectManifest } from "../domain/schema.js";
import { publishAssetMutation, recoverAssetMutation } from "./asset-transaction.js";
import { replaceFileAtomically, withManifestLock } from "./manifest-write.js";

export class ManifestMigrationRequiredError extends Error {
  constructor(readonly foundVersion: number) {
    super(`Migration required for manifest schema version ${foundVersion}.`);
    this.name = "ManifestMigrationRequiredError";
  }
}

type Mutation = (current: ProjectManifest) => ProjectManifest | Promise<ProjectManifest>;

function assertApprovedArtifactsUnchanged(existing: ProjectManifest | undefined, next: ProjectManifest): void {
  for (const artifact of existing?.artifacts ?? []) {
    if (artifact.status === "approved" && !next.artifacts.some((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(artifact)
    )) throw new Error(`Approved artifact ${artifact.id} v${artifact.version} is immutable.`);
  }
}

export class ProjectStore {
  private observed: string | undefined;
  constructor(readonly root: string) {}

  async inspect(): Promise<AnyProjectManifest> {
    return withManifestLock(this.manifestPath, async () => {
      await recoverAssetMutation(this.root);
      const manifest = await this.readUnlocked();
      this.observed = JSON.stringify(manifest);
      return manifest;
    });
  }

  async load(): Promise<ProjectManifest> {
    return this.requireCurrent(await this.inspect());
  }

  async save(manifest: ProjectManifest): Promise<void> {
    await withManifestLock(this.manifestPath, async () => {
      await recoverAssetMutation(this.root);
      const next = ProjectManifestSchema.parse(manifest);
      let existing: ProjectManifest | undefined;
      try { existing = this.requireCurrent(await this.readUnlocked()); }
      catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (this.observed !== undefined && this.observed !== JSON.stringify(existing)) {
        throw new Error("Project manifest changed; reload before saving.");
      }
      await this.publish(existing, next);
      this.observed = JSON.stringify(next);
    });
  }

  /** Read, mutate, publish and compensate private files within a single manifest lock. */
  async mutate(mutation: Mutation, onFailure?: () => Promise<unknown>): Promise<void> {
    await this.mutateWithLock(mutation, onFailure, false);
  }

  async mutateAssets(mutation: Mutation, onFailure?: () => Promise<unknown>): Promise<void> {
    await this.mutateWithLock(mutation, onFailure, true);
  }

  async writeAssetDossier(manifest: ProjectManifest): Promise<void> {
    await withManifestLock(this.manifestPath, async () => {
      await recoverAssetMutation(this.root);
      const next = ProjectManifestSchema.parse(manifest);
      let current: ProjectManifest | undefined;
      try { current = this.requireCurrent(await this.readUnlocked()); }
      catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (current && JSON.stringify(current.assets) !== JSON.stringify(next.assets)) {
        throw new Error("Project assets changed; reload before writing the dossier.");
      }
      await replaceFileAtomically(join(this.root, ".creative-preproduction", "asset-dossier.md"), renderAssetDossier(next));
    });
  }

  private async mutateWithLock(mutation: Mutation, onFailure: (() => Promise<unknown>) | undefined, refreshDossier: boolean): Promise<void> {
    await withManifestLock(this.manifestPath, async () => {
      await recoverAssetMutation(this.root);
      const current = this.requireCurrent(await this.readUnlocked());
      try {
        const next = ProjectManifestSchema.parse(await mutation(structuredClone(current)));
        await this.publish(current, next, refreshDossier);
        this.observed = JSON.stringify(next);
      } catch (error: unknown) {
        // Compensate only after confirming no manifest committed. Unreadable state
        // retains private bytes for recovery instead of deleting a live reference.
        const [state] = await Promise.allSettled([this.readUnlocked()]);
        if (onFailure && state.status === "fulfilled" && JSON.stringify(state.value) === JSON.stringify(current)) {
          await Promise.allSettled([onFailure()]);
        }
        throw error;
      }
    });
  }

  async migrate(harnessVersion: string, now: Date = new Date()): Promise<ProjectManifest> {
    return withManifestLock(this.manifestPath, async () => {
      await recoverAssetMutation(this.root);
      const contents = await readFile(this.manifestPath, "utf8");
      const inspected = AnyProjectManifestSchema.parse(JSON.parse(contents));
      if (inspected.schemaVersion === 2) {
        this.observed = JSON.stringify(inspected);
        return inspected;
      }
      const backup = await open(`${this.manifestPath}.v1.backup`, "wx");
      try { await backup.writeFile(contents, "utf8"); } finally { await backup.close(); }
      const migrated = migrateManifest(inspected, harnessVersion, now);
      await replaceFileAtomically(this.manifestPath, `${JSON.stringify(migrated, null, 2)}\n`);
      this.observed = JSON.stringify(migrated);
      return migrated;
    });
  }

  private async publish(current: ProjectManifest | undefined, next: ProjectManifest, refreshDossier = false): Promise<void> {
    assertApprovedArtifactsUnchanged(current, next);
    if (refreshDossier && JSON.stringify(current) === JSON.stringify(next)) {
      // An unchanged manifest needs only one atomic file replacement, with no journal.
      await replaceFileAtomically(join(this.root, ".creative-preproduction", "asset-dossier.md"), renderAssetDossier(next));
    } else if (current && (refreshDossier || JSON.stringify(current.assets) !== JSON.stringify(next.assets))) {
      await publishAssetMutation(this.root, next);
    } else {
      await replaceFileAtomically(this.manifestPath, `${JSON.stringify(next, null, 2)}\n`);
    }
  }

  private async readUnlocked(): Promise<AnyProjectManifest> {
    return AnyProjectManifestSchema.parse(JSON.parse(await readFile(this.manifestPath, "utf8")));
  }

  private requireCurrent(manifest: AnyProjectManifest): ProjectManifest {
    if (manifest.schemaVersion === 1) throw new ManifestMigrationRequiredError(1);
    return manifest;
  }

  private get manifestPath(): string { return join(this.root, ".creative-preproduction", "manifest.json"); }
}
