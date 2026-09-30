import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function privateRootFor(root: string): string {
  return resolve(root, ".creative-preproduction", "private");
}

function isWithin(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate);
  return fromBase === "" || (
    fromBase !== ".." &&
    !fromBase.startsWith(`..${sep}`) &&
    !isAbsolute(fromBase)
  );
}

function assertLexicalPrivateContainment(root: string, candidate: string): void {
  if (!isWithin(privateRootFor(root), resolve(candidate))) {
    throw new Error("Managed private paths must remain inside the private workspace.");
  }
}

export async function assertNoLinkedPrivateAncestors(
  root: string,
  candidate: string
): Promise<void> {
  const projectRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  assertLexicalPrivateContainment(root, resolvedCandidate);
  const fromProject = relative(projectRoot, resolvedCandidate);
  if (!isWithin(projectRoot, resolvedCandidate)) {
    throw new Error("Managed private paths must remain inside the project.");
  }
  let current = projectRoot;
  for (const part of fromProject.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink()) {
        throw new Error(`Private workspace path has a linked ancestor: ${current}`);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

export async function verifyCanonicalPrivateDirectory(
  root: string,
  directory: string
): Promise<void> {
  assertLexicalPrivateContainment(root, directory);
  await assertNoLinkedPrivateAncestors(root, directory);
  const [canonicalRoot, canonicalPrivateRoot, canonicalDirectory] = await Promise.all([
    realpath(resolve(root)),
    realpath(privateRootFor(root)),
    realpath(resolve(directory))
  ]);
  if (
    !isWithin(canonicalRoot, canonicalPrivateRoot) ||
    !isWithin(canonicalPrivateRoot, canonicalDirectory)
  ) {
    throw new Error("Private workspace canonical path escapes the project.");
  }
}

export async function ensureSecurePrivateDirectory(
  root: string,
  directory: string
): Promise<void> {
  await assertNoLinkedPrivateAncestors(root, directory);
  await mkdir(directory, { recursive: true });
  await verifyCanonicalPrivateDirectory(root, directory);
}
