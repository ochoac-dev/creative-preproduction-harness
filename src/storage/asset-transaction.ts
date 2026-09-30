import { randomUUID } from "node:crypto";
import { readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ProjectManifestSchema, type ProjectManifest } from "../domain/schema.js";
import { renderAssetDossier } from "../services/asset-dossier.js";
import { replaceFileAtomically, stageFile } from "./manifest-write.js";
import { assertNoLinkedPrivateAncestors } from "./private-safety.js";
import { PrivateWorkspace } from "./private-workspace.js";
import { syncDirectory } from "./directory-sync.js";

// Only fixed local targets are recoverable. The journal cannot supply filesystem paths.
const JournalSchema = z.object({
  version: z.literal(1), id: z.uuid(), previousManifest: z.string(), nextManifest: z.string(),
  previousDossier: z.string().nullable()
}).strict();
type Journal = z.infer<typeof JournalSchema>;

function paths(root: string, id?: string) {
  const workspace = join(root, ".creative-preproduction");
  const manifest = join(workspace, "manifest.json");
  const dossier = join(workspace, "asset-dossier.md");
  const journal = join(workspace, "private", "asset-mutation.json");
  return { manifest, dossier, journal, staged: [manifest, dossier, journal].map((path) => `${path}.${id}.tmp`) };
}

async function readOptional(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Called only while ProjectStore holds the manifest lock. Manifest publication is the commit point. */
export async function recoverAssetMutation(root: string): Promise<"committed" | "rolled-back" | undefined> {
  const { journal: journalPath } = paths(root);
  await assertNoLinkedPrivateAncestors(root, journalPath);
  const bytes = await readOptional(journalPath);
  if (bytes === null) return;
  const journal = JournalSchema.parse(JSON.parse(bytes));
  ProjectManifestSchema.parse(JSON.parse(journal.previousManifest));
  const next = ProjectManifestSchema.parse(JSON.parse(journal.nextManifest));
  const targets = paths(root, journal.id);
  const current = await readFile(targets.manifest, "utf8");
  const committed = current === journal.nextManifest;
  if (!committed && current !== journal.previousManifest) {
    throw new Error("Asset transaction conflicts with the current manifest; recovery cannot overwrite it.");
  }
  const dossier = committed ? renderAssetDossier(next) : journal.previousDossier;
  if (await readOptional(targets.dossier) !== dossier) {
    if (dossier === null) await rm(targets.dossier, { force: true });
    else await replaceFileAtomically(targets.dossier, dossier);
  }
  await Promise.allSettled(targets.staged.map((path) => rm(path, { force: true })));
  // Recovery can follow an interruption immediately after a canonical rename.
  // Persist both canonical names before discarding their recovery record.
  await syncDirectory(dirname(targets.manifest));
  await rm(journalPath, { force: true });
  await syncDirectory(dirname(journalPath));
  return committed ? "committed" : "rolled-back";
}

export async function publishAssetMutation(root: string, next: ProjectManifest): Promise<void> {
  await new PrivateWorkspace(root).initialize();
  const id = randomUUID();
  const targets = paths(root, id);
  // The private directory may have just been created; persist its parent entry.
  await syncDirectory(dirname(targets.manifest));
  const [manifestTemp, dossierTemp, journalTemp] = targets.staged as [string, string, string];
  const journal: Journal = {
    version: 1, id,
    previousManifest: await readFile(targets.manifest, "utf8"),
    nextManifest: `${JSON.stringify(next, null, 2)}\n`,
    previousDossier: await readOptional(targets.dossier)
  };
  let journalPublished = false;
  let committed = false;
  try {
    await stageFile(manifestTemp, journal.nextManifest);
    await stageFile(dossierTemp, renderAssetDossier(next));
    await stageFile(journalTemp, `${JSON.stringify(journal)}\n`);
    await assertNoLinkedPrivateAncestors(root, targets.journal);
    await rename(journalTemp, targets.journal);
    journalPublished = true;
    await syncDirectory(dirname(targets.journal));
    await rename(dossierTemp, targets.dossier);
    await syncDirectory(dirname(targets.dossier));
    await rename(manifestTemp, targets.manifest);
    committed = true;
    await syncDirectory(dirname(targets.manifest));
  } catch (error: unknown) {
    if (journalPublished) {
      const [canonical] = await Promise.allSettled([readFile(targets.manifest, "utf8")]);
      committed = canonical.status === "fulfilled" && canonical.value === journal.nextManifest;
      // Recovery shares this critical section. If rollback fails, keep the original
      // error and journal; the next public operation repairs before exposing state.
      try { await recoverAssetMutation(root); } catch { /* journal retained */ }
    }
    if (!committed) throw error;
  } finally {
    await Promise.allSettled(targets.staged.map((path) => rm(path, { force: true })));
    if (committed) await Promise.allSettled([recoverAssetMutation(root)]);
  }
}
