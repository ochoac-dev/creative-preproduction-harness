import { open } from "node:fs/promises";

export type DirectorySyncResult = "synced" | "unsupported-on-windows";

/**
 * Persist directory-entry changes on filesystems supporting directory fsync.
 * Windows directory handles do not provide the same FlushFileBuffers guarantee:
 * https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-a-handle-to-a-directory
 * https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers
 * Report that limitation explicitly; never translate it into a successful barrier.
 * Other I/O errors remain failures. Callers on Windows retain process-level journal
 * recovery, but must not claim POSIX-style power-loss durability for rename ordering.
 */
export async function syncDirectory(directory: string): Promise<DirectorySyncResult> {
  const handle = await open(directory, "r");
  try {
    if (!(await handle.stat()).isDirectory()) throw new Error(`Directory sync requires a directory: ${directory}`);
    try {
      await handle.sync();
      return "synced";
    } catch (error: unknown) {
      if (process.platform === "win32" && ["EPERM", "EINVAL", "ENOTSUP"].includes(
        (error as NodeJS.ErrnoException).code ?? ""
      )) return "unsupported-on-windows";
      throw error;
    }
  } finally {
    await Promise.allSettled([handle.close()]);
  }
}
