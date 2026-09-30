import { posix, win32 } from "node:path";

const PRIVATE_PREFIX = ".creative-preproduction/private/";

export function normalizeProjectArtifactPath(path: string): string {
  const portable = path.replaceAll("\\", "/");
  if (
    path.trim().length === 0 ||
    posix.isAbsolute(portable) ||
    win32.isAbsolute(path) ||
    /^[a-z]:/iu.test(path) ||
    portable.includes(":") ||
    portable.split("/").some((part) => part === "..")
  ) {
    throw new Error("Artifact path must be a safe project-relative path.");
  }
  const normalized = posix.normalize(portable);
  if (normalized === "." || normalized.startsWith("../")) {
    throw new Error("Artifact path must be a safe project-relative path.");
  }
  return normalized;
}

export function normalizePrivateArtifactPath(path: string): string {
  const normalized = normalizeProjectArtifactPath(path);
  if (!normalized.startsWith(PRIVATE_PREFIX)) {
    throw new Error("Provisional artifact paths must remain inside the private workspace.");
  }
  return normalized;
}

export function requirePersistedPrivateArtifactPath(path: string): string {
  const normalized = normalizePrivateArtifactPath(path);
  if (normalized !== path) {
    throw new Error("Provisional artifact paths must use a normalized safe project-relative path.");
  }
  return normalized;
}
