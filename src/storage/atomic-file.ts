import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, rm, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type PublicationOwnership = "created" | "reused";

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function publishFileAtomically(
  targetPath: string,
  writeTemporary: (temporaryPath: string) => Promise<void>,
  options: {
    collisionMessage: string;
    verifyParent: () => Promise<void>;
    reuseIdentical?: boolean;
  }
): Promise<PublicationOwnership> {
  const lockPath = `${targetPath}.lock`;
  const temporaryPath = join(dirname(targetPath), `.${basename(targetPath)}.${randomUUID()}.tmp`);
  await options.verifyParent();
  let lock: FileHandle;
  try {
    lock = await open(lockPath, "wx");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(options.collisionMessage, { cause: error });
    }
    throw error;
  }

  let temporaryCreated = false;
  try {
    if (!options.reuseIdentical && await exists(targetPath)) {
      throw new Error(options.collisionMessage);
    }
    await options.verifyParent();
    temporaryCreated = true;
    await writeTemporary(temporaryPath);
    await options.verifyParent();
    if (await exists(targetPath)) {
      const status = await lstat(targetPath);
      if (options.reuseIdentical && status.isFile() && !status.isSymbolicLink() &&
        (await readFile(targetPath)).equals(await readFile(temporaryPath))) return "reused";
      throw new Error(options.collisionMessage);
    }
    await rename(temporaryPath, targetPath);
    temporaryCreated = false;
    return "created";
  } finally {
    await Promise.allSettled([
      lock.close(),
      ...(temporaryCreated ? [rm(temporaryPath, { force: true })] : [])
    ]);
    const [lockRemoval] = await Promise.allSettled([rm(lockPath, { force: true })]);
    if (lockRemoval?.status === "rejected") await Promise.allSettled([rm(lockPath, { force: true })]);
  }
}
