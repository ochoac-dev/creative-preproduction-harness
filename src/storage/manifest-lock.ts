import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rm, type FileHandle } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

export interface ManifestLockOwner {
  version: 1;
  pid: number;
  hostname: string;
  token: string;
  startedAt: string;
}
export interface ManifestLockInspection {
  state: "unlocked" | "live" | "dead" | "uncertain";
  message: string;
  owner?: ManifestLockOwner;
}
interface Snapshot { dev: number; ino: number; contents: string; }

function code(error: unknown): string | undefined { return (error as NodeJS.ErrnoException).code; }
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error: unknown) { if (code(error) === "ENOENT") return false; throw error; }
}

async function snapshot(path: string): Promise<Snapshot | undefined> {
  let file: FileHandle;
  try {
    const location = await lstat(path);
    if (!location.isFile() || location.isSymbolicLink()) throw new Error("Lock has uncertain non-regular metadata.");
    file = await open(path, "r");
    const identity = await file.stat();
    if (identity.dev !== location.dev || identity.ino !== location.ino) {
      await file.close();
      throw new Error("Lock identity changed while inspecting; retry doctor.");
    }
  } catch (error: unknown) { if (code(error) === "ENOENT") return undefined; throw error; }
  try {
    const identity = await file.stat();
    return { dev: identity.dev, ino: identity.ino, contents: await file.readFile("utf8") };
  } finally { await file.close(); }
}

function inspectSnapshot(value: Snapshot | undefined): ManifestLockInspection {
  if (value === undefined) return { state: "unlocked", message: "No manifest lock is present." };
  let owner: ManifestLockOwner;
  try {
    const parsed = JSON.parse(value.contents) as Partial<ManifestLockOwner>;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.pid) || parsed.pid! <= 0
      || typeof parsed.hostname !== "string" || parsed.hostname.length === 0
      || typeof parsed.token !== "string" || parsed.token.length === 0
      || typeof parsed.startedAt !== "string" || !Number.isFinite(Date.parse(parsed.startedAt))) {
      throw new Error("Invalid metadata");
    }
    owner = parsed as ManifestLockOwner;
  } catch {
    return { state: "uncertain", message: "Lock has legacy or invalid owner metadata; automatic recovery is unsafe." };
  }
  if (owner.hostname !== hostname()) {
    return { state: "uncertain", owner, message: `Lock belongs to host ${owner.hostname}; local process state cannot prove it is dead.` };
  }
  try {
    process.kill(owner.pid, 0);
    return { state: "live", owner, message: `Manifest lock owner process ${owner.pid} is live.` };
  } catch (error: unknown) {
    if (code(error) === "ESRCH") return { state: "dead", owner, message: `Manifest lock owner process ${owner.pid} is no longer running.` };
    return { state: "uncertain", owner, message: `Cannot determine whether manifest lock owner process ${owner.pid} is live.` };
  }
}

/** Inspect without acquiring a writer lock, replaying journals, or modifying files. */
export async function inspectManifestLock(manifestPath: string): Promise<ManifestLockInspection> {
  if (await exists(`${manifestPath}.lock.recovery`)) {
    return { state: "uncertain", message: "A lock recovery marker is present; another recovery may be active or interrupted. Investigate its owner before removing it." };
  }
  try { return inspectSnapshot(await snapshot(`${manifestPath}.lock`)); }
  catch (error: unknown) { return { state: "uncertain", message: error instanceof Error ? error.message : "Lock inspection failed." }; }
}

async function removeOwned(path: string, identity: { dev: number; ino: number }): Promise<void> {
  let present;
  try { present = await lstat(path); }
  catch (error: unknown) { if (code(error) === "ENOENT") return; throw error; }
  if (present.dev !== identity.dev || present.ino !== identity.ino || present.isSymbolicLink()) return;
  await rm(path);
}

async function createOwned(path: string): Promise<{ file: FileHandle; release: () => Promise<void> }> {
  const file = await open(path, "wx");
  const identity = await file.stat();
  const release = async () => {
    await Promise.allSettled([file.close()]);
    const [removed] = await Promise.allSettled([removeOwned(path, identity)]);
    if (removed?.status === "rejected") await Promise.allSettled([removeOwned(path, identity)]);
  };
  try {
    const owner: ManifestLockOwner = { version: 1, pid: process.pid, hostname: hostname(),
      token: randomUUID(), startedAt: new Date().toISOString() };
    await file.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await file.sync();
    return { file, release };
  } catch (error: unknown) { await release(); throw error; }
}

export async function acquireManifestLock(manifestPath: string): Promise<() => Promise<void>> {
  await mkdir(dirname(manifestPath), { recursive: true });
  const lockPath = `${manifestPath}.lock`;
  const recoveryPath = `${lockPath}.recovery`;
  const blocked = () => new Error(`Another writer is updating ${manifestPath}. Retry after it completes; use doctor to inspect an interrupted writer.`);
  if (await exists(recoveryPath)) throw blocked();
  let owned;
  try { owned = await createOwned(lockPath); }
  catch (error: unknown) { if (code(error) === "EEXIST") throw blocked(); throw error; }
  // A recoverer may have started after the initial marker check. Do not enter
  // the critical section until both locks agree that acquisition is safe.
  try {
    if (await exists(recoveryPath)) throw blocked();
  } catch (error: unknown) { await owned.release(); throw error; }
  return owned.release;
}

/** Explicitly release a provably dead local owner; never infer death from lock age. */
export async function recoverManifestLock(manifestPath: string): Promise<boolean> {
  const lockPath = `${manifestPath}.lock`;
  const recoveryPath = `${lockPath}.recovery`;
  let recovery;
  try { recovery = await createOwned(recoveryPath); }
  catch (error: unknown) {
    if (code(error) === "ENOENT") return false;
    if (code(error) === "EEXIST") throw new Error("Another lock recovery is active or uncertain; recovery marker already exists.");
    throw error;
  }
  try {
    const before = await snapshot(lockPath);
    const inspection = inspectSnapshot(before);
    if (inspection.state === "unlocked") return false;
    if (inspection.state !== "dead") throw new Error(`Refusing lock recovery: ${inspection.message}`);
    const current = await snapshot(lockPath);
    if (current === undefined || current.dev !== before!.dev || current.ino !== before!.ino || current.contents !== before!.contents) {
      throw new Error("Lock identity changed during recovery; refusing to remove a replacement writer.");
    }
    if (inspectSnapshot(current).state !== "dead") throw new Error("Lock owner state changed during recovery; refusing recovery.");
    await rm(lockPath);
    return true;
  } finally { await recovery.release(); }
}
