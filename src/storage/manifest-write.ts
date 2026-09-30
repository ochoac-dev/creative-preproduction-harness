import { randomUUID } from "node:crypto";
import { open, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "./directory-sync.js";
import { acquireManifestLock } from "./manifest-lock.js";
export { inspectManifestLock, recoverManifestLock } from "./manifest-lock.js";

/** Hold one filesystem lock through validation, preparation, and atomic replacement. */
export async function withManifestLock<T>(
  manifestPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const release = await acquireManifestLock(manifestPath);
  try {
    return await operation();
  } finally {
    // A cleanup failure cannot turn a committed replacement into a failed mutation.
    await release();
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
