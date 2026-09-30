import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncDirectory } from "../../src/storage/directory-sync.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
const roots: string[] = [];
afterEach(async () => {
  Object.defineProperty(process, "platform", platformDescriptor);
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "directory-sync-"));
  roots.push(root);
  return root;
}

describe("directory sync capability", () => {
  it("reports the real host's directory-fsync capability explicitly", async () => {
    expect(await syncDirectory(await directory())).toBe(process.platform === "win32" ? "unsupported-on-windows" : "synced");
  });

  it.each([
    ["win32", "EPERM", "unsupported-on-windows"],
    ["win32", "EINVAL", "unsupported-on-windows"],
    ["win32", "EIO", "error"],
    ["linux", "EPERM", "error"],
    ["linux", "EINVAL", "error"],
    ["linux", undefined, "synced"]
  ] as const)("handles %s fsync outcome %s as %s and closes the directory handle", async (platform, code, expected) => {
    const root = await directory();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const failure = Object.assign(new Error("directory sync failed"), { code });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      handle = await actual.open(path, flags, mode);
      vi.spyOn(handle, "sync").mockImplementation(async () => { if (code) throw failure; });
      return handle;
    });
    Object.defineProperty(process, "platform", { ...platformDescriptor, value: platform });
    if (expected === "error") await expect(syncDirectory(root)).rejects.toBe(failure);
    else await expect(syncDirectory(root)).resolves.toBe(expected);
    await expect(handle!.stat()).rejects.toMatchObject({ code: "EBADF" });
  });
});
