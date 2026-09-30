import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "./directory-sync.js";

/** Hold one filesystem lock through validation, preparation, and atomic replacement. */
export async function withManifestLock<T>(
  manifestPath: string,
  operation: () => Promise<T>
): Promise<T> {
  await mkdir(dirname(manifestPath), { recursive: true });
  const lockPath = `${manifestPath}.lock`;
  let lock: FileHandle;
  try {
    lock = await open(lockPath, "wx");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Another writer is updating ${manifestPath}. Retry after it completes.`, { cause: error });
    }
    throw error;
  }

  try {
    return await operation();
  } finally {
    // A cleanup failure cannot turn a committed replacement into a failed mutation.
    await Promise.allSettled([lock.close()]);
    const [removed] = await Promise.allSettled([rm(lockPath, { force: true })]);
    if (removed?.status === "rejected") await Promise.allSettled([rm(lockPath, { force: true })]);
  }
}

/** Caller must hold the manifest lock when replacing canonical manifest state. */
export async function replaceFileAtomically(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await stageFile(temporaryPath, contents);
    await rename(temporaryPath, path);
    await syncDirectory(dirname(path));
  } finally {
    await Promise.allSettled([rm(temporaryPath, { force: true })]);
  }
}

export async function stageFile(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { encoding: "utf8", flag: "wx" });
  const file = await open(path, "r+");
  try { await file.sync(); } finally { await file.close(); }
}

export async function writeManifestAtomically(
  manifestPath: string,
  prepareContents: () => Promise<string>
): Promise<void> {
  await withManifestLock(manifestPath, async () => {
    await replaceFileAtomically(manifestPath, await prepareContents());
  });
}
