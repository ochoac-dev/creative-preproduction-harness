import { constants } from "node:fs";
import { copyFile, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { ProjectManifestSchema } from "../domain/schema.js";
import { publishFileAtomically, type PublicationOwnership } from "./atomic-file.js";
import {
  assertNoLinkedPrivateAncestors,
  ensureSecurePrivateDirectory,
  privateRootFor,
  verifyCanonicalPrivateDirectory
} from "./private-safety.js";

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function writeExclusiveText(path: string, contents: string): Promise<void> {
  const file = await open(path, "wx");
  try {
    await file.writeFile(contents, "utf8");
  } finally {
    await file.close();
  }
}

function containsPathSyntax(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\") || value.includes("..");
}

function normalizeGeneratedId(value: string, label: string): string {
  if (containsPathSyntax(value)) {
    throw new Error(`${label} must be a safe identifier without path syntax.`);
  }
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!SAFE_ID.test(normalized)) {
    throw new Error(`${label} must contain letters or numbers.`);
  }
  return normalized;
}

function requireSafeId(value: string, label: string): string {
  if (containsPathSyntax(value) || !SAFE_ID.test(value)) {
    throw new Error(`${label} must be a safe normalized identifier.`);
  }
  return value;
}

export class PrivateWorkspace {
  private readonly privateRoot: string;

  constructor(readonly root: string) {
    this.privateRoot = privateRootFor(root);
  }

  async initialize(): Promise<void> {
    await ensureSecurePrivateDirectory(this.root, this.privateRoot);
    const ignorePath = join(this.privateRoot, ".gitignore");
    try {
      const status = await lstat(ignorePath);
      if (status.isSymbolicLink() || !status.isFile()) {
        throw new Error("Private workspace .gitignore must be a regular file.");
      }
      if (await readFile(ignorePath, "utf8") !== "*\n!.gitignore\n") {
        throw new Error("Private workspace .gitignore has unexpected contents.");
      }
      return;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await publishFileAtomically(
      ignorePath,
      (temporaryPath) => writeExclusiveText(temporaryPath, "*\n!.gitignore\n"),
      {
        collisionMessage: "Private workspace .gitignore already exists.",
        verifyParent: () => verifyCanonicalPrivateDirectory(this.root, this.privateRoot)
      }
    );
  }

  async importFile(ref: string, sourcePath: string): Promise<{
    ref: string;
    relativePath: string;
    ownership: PublicationOwnership;
  }> {
    const normalizedRef = normalizeGeneratedId(ref, "Private reference");
    const destination = this.managedPath("assets", normalizedRef, "source");
    const destinationDirectory = join(this.privateRoot, "assets", normalizedRef);
    await ensureSecurePrivateDirectory(this.root, destinationDirectory);
    const ownership = await publishFileAtomically(
      destination,
      (temporaryPath) => copyFile(sourcePath, temporaryPath, constants.COPYFILE_EXCL),
      {
        collisionMessage: `Private reference ${normalizedRef} already exists.`,
        reuseIdentical: true,
        verifyParent: () => verifyCanonicalPrivateDirectory(this.root, destinationDirectory)
      }
    );
    return {
      ref: normalizedRef,
      relativePath: this.projectRelative(destination),
      ownership
    };
  }

  resolveRef(ref: string): string {
    return this.managedPath("assets", requireSafeId(ref, "Safe private reference"), "source");
  }

  async removeImportedFile(ref: string): Promise<void> {
    await this.removeUnreferencedFile(this.resolveRef(ref));
  }

  studyDirectory(artifactId: string, version: number): string {
    const safeArtifactId = requireSafeId(artifactId, "Safe artifact ID");
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("Study must use a positive version integer.");
    }
    return this.managedPath("studies", safeArtifactId, `v${version}`);
  }

  async removeStudy(artifactId: string, version: number): Promise<void> {
    const preview = join(this.studyDirectory(artifactId, version), "index.html");
    await this.removeUnreferencedFile(preview);
  }

  /** The command's ProjectStore mutation retains its manifest lock through this cleanup. */
  private async removeUnreferencedFile(target: string): Promise<void> {
    await assertNoLinkedPrivateAncestors(this.root, target);
    const canonical = async (path: string): Promise<string | undefined> => {
      try {
        const resolved = await realpath(path);
        return process.platform === "win32" ? resolved.toLowerCase() : resolved;
      } catch (error: unknown) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
        throw error;
      }
    };
    const destination = await canonical(target);
    if (destination === undefined) return;
    // Do not infer safety from raw spelling, rights, or storage kind. A managed asset
    // or another artifact may refer to the same private file through an alias.
    const manifest = ProjectManifestSchema.parse(JSON.parse(await readFile(
      join(this.root, ".creative-preproduction", "manifest.json"), "utf8"
    )));
    const references = [
      ...manifest.assets.map((asset) => asset.storage.kind === "private"
        ? this.resolveRef(asset.storage.ref)
        : resolve(this.root, asset.storage.path.replaceAll("\\", "/"))),
      ...manifest.artifacts.map((artifact) => resolve(this.root, artifact.path.replaceAll("\\", "/")))
    ];
    const canonicalReferences = await Promise.all(references.map(canonical));
    if (canonicalReferences.includes(destination)) return;
    try { await unlink(target); }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private managedPath(...parts: string[]): string {
    return this.assertInside(resolve(this.privateRoot, ...parts));
  }

  private assertInside(candidate: string): string {
    const resolved = resolve(candidate);
    const fromPrivateRoot = relative(this.privateRoot, resolved);
    if (fromPrivateRoot === "" || (!fromPrivateRoot.startsWith(`..${sep}`) && fromPrivateRoot !== ".." && !isAbsolute(fromPrivateRoot))) {
      return resolved;
    }
    throw new Error("Managed private paths must remain inside the private workspace.");
  }

  private projectRelative(candidate: string): string {
    return relative(resolve(this.root), candidate).split(sep).join("/");
  }
}
