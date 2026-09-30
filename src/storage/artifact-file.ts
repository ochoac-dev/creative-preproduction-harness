import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { normalizeProjectArtifactPath } from "../domain/artifact-path.js";
import type { ArtifactRecord, ProjectManifest } from "../domain/schema.js";
import { assertNoLinkedPrivateAncestors, privateRootFor } from "./private-safety.js";

function isWithin(base: string, candidate: string): boolean {
  const remainder = relative(base, candidate);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`));
}

async function assertNoLinkedAncestors(root: string, candidate: string): Promise<void> {
  let current = resolve(root);
  for (const part of relative(current, candidate).split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error(`Artifact file has a linked path: ${current}`);
    }
  }
}

type FileIdentity = { dev: number; ino: number };

async function assertDistinctPrivateSource(root: string, file: FileIdentity, sourcePath: string): Promise<void> {
  let source;
  try { source = await stat(resolve(root, sourcePath)); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (source !== undefined && source.dev === file.dev && source.ino === file.ino) {
    throw new Error("Project artifact file must be a separate copy of the private source, not a hard link.");
  }
}

async function assertNoRetainedPrivateAlias(root: string, file: FileIdentity): Promise<void> {
  const privateRoot = privateRootFor(root);
  await assertNoLinkedPrivateAncestors(root, privateRoot);
  let privateDirectory;
  try { privateDirectory = await lstat(privateRoot); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!privateDirectory.isDirectory()) throw new Error("Private workspace must be a regular directory.");
  const directories = [privateRoot];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const source = await lstat(path);
      if (source.isSymbolicLink()) throw new Error(`Private workspace contains a linked path: ${path}`);
      if (source.isDirectory()) directories.push(path);
      else if (source.isFile() && source.dev === file.dev && source.ino === file.ino) {
        throw new Error("Project artifact file must be a separate copy of retained private bytes, not a hard link.");
      }
    }
  }
}

/** Verify an existing regular file before registering or publishing project-visible work. */
export async function assertProjectArtifactFile(root: string, path: string, privateSource?: string): Promise<void> {
  const normalized = normalizeProjectArtifactPath(path);
  if (normalized.toLowerCase() === ".creative-preproduction/private"
    || normalized.toLowerCase().startsWith(".creative-preproduction/private/")) {
    throw new Error("Project artifact files must remain outside the private workspace.");
  }
  const candidate = resolve(root, normalized);
  await assertNoLinkedAncestors(root, candidate);
  const [canonicalRoot, canonicalCandidate, file] = await Promise.all([
    realpath(resolve(root)), realpath(candidate), lstat(candidate)
  ]);
  if (!isWithin(canonicalRoot, canonicalCandidate)
    || isWithin(resolve(canonicalRoot, ".creative-preproduction/private"), canonicalCandidate)) {
    throw new Error("Project artifact file must remain inside the project and outside the private workspace.");
  }
  if (!file.isFile()) throw new Error("Artifact path must identify a regular file.");
  // Rights clearance preserves private sources after their manifest storage
  // label changes. A multiply linked target must be checked against those bytes.
  if (file.nlink > 1) await assertNoRetainedPrivateAlias(root, file);
  if (privateSource !== undefined) await assertDistinctPrivateSource(root, file, privateSource);
}

/** Apply the project boundary and every recorded private-source boundary together. */
export async function assertManifestProjectArtifactFile(root: string, manifest: ProjectManifest, path: string): Promise<void> {
  await assertProjectArtifactFile(root, path);
  const file = await stat(resolve(root, normalizeProjectArtifactPath(path)));
  const privateSources = [
    ...manifest.artifacts.filter((artifact) => artifact.visibility === "private").map((artifact) => artifact.path),
    ...manifest.assets.flatMap((asset) => asset.storage.kind === "private"
      ? [`.creative-preproduction/private/assets/${asset.storage.ref}/source`] : [])
  ];
  for (const source of privateSources) await assertDistinctPrivateSource(root, file, source);
}

/** Each artifact version owns a distinct path and file; an existing record may ignore only itself. */
export async function assertUnusedProjectArtifactFile(
  root: string,
  manifest: ProjectManifest,
  path: string,
  ignore?: Pick<ArtifactRecord, "id" | "version">
): Promise<void> {
  const normalized = normalizeProjectArtifactPath(path);
  await assertManifestProjectArtifactFile(root, manifest, normalized);
  const target = await stat(resolve(root, normalized));
  for (const artifact of manifest.artifacts) {
    if (ignore !== undefined && artifact.id === ignore.id && artifact.version === ignore.version) continue;
    const usedPath = normalizeProjectArtifactPath(artifact.path);
    if (usedPath === normalized) {
      throw new Error(`Artifact file ${normalized} is already used by ${artifact.id} v${artifact.version}; use a different path.`);
    }
    try {
      const used = await stat(resolve(root, usedPath));
      if (used.dev === target.dev && used.ino === target.ino) {
        throw new Error(`Artifact file ${normalized} is already used by ${artifact.id} v${artifact.version}; use a different file.`);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

/** Private files use their own containment boundary; absent private bytes remain a warning to callers. */
export async function assertPrivateArtifactFile(root: string, path: string): Promise<void> {
  const candidate = resolve(root, path);
  await assertNoLinkedPrivateAncestors(root, candidate);
  const [canonicalPrivate, canonicalCandidate, file] = await Promise.all([
    realpath(privateRootFor(root)), realpath(candidate), lstat(candidate)
  ]);
  if (!isWithin(canonicalPrivate, canonicalCandidate) || !file.isFile()) {
    throw new Error("Private artifact path must identify a regular file inside the private workspace.");
  }
}
