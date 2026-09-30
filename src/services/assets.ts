import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { normalizeProjectArtifactPath } from "../domain/artifact-path.js";
import {
  AssetRecordSchema,
  type AssetRecord,
  type ProjectManifest
} from "../domain/schema.js";

export interface CreateAssetInput {
  id: string;
  title: string;
  creator?: string;
  source: string;
  creativeOwner?: string;
  intendedRole: string;
  modificationPolicy: AssetRecord["modificationPolicy"];
  rightsStatus: AssetRecord["rightsStatus"];
  providerScopes: AssetRecord["providerScopes"];
  storage: AssetRecord["storage"];
  allowedTreatments: string[];
  prohibitedTreatments: string[];
  visualNotes: Record<string, string>;
  responsiveGuidance: string;
  accessibilityIntent: string;
  unresolvedQuestions: string[];
  now?: Date;
}

export interface UpdateAssetInput {
  title?: string;
  creator?: string;
  source?: string;
  creativeOwner?: string;
  intendedRole?: string;
  modificationPolicy?: AssetRecord["modificationPolicy"];
  rightsStatus?: AssetRecord["rightsStatus"];
  providerScopes?: AssetRecord["providerScopes"];
  storage?: AssetRecord["storage"];
  allowedTreatments?: string[];
  prohibitedTreatments?: string[];
  visualNotes?: Record<string, string>;
  responsiveGuidance?: string;
  accessibilityIntent?: string;
  unresolvedQuestions?: string[];
}

type AssetInvariantInput = Pick<
  AssetRecord,
  "storage" | "rightsStatus" | "providerScopes" | "modificationPolicy" | "allowedTreatments"
>;

function timestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function normalizedProviderScopes(
  rightsStatus: AssetRecord["rightsStatus"],
  providerScopes: AssetRecord["providerScopes"]
): AssetRecord["providerScopes"] {
  return rightsStatus === "restricted" && providerScopes.length === 0
    ? ["local-html-svg"]
    : [...providerScopes];
}

export function assertManagedAssetPath(path: string): void {
  const normalized = normalizeProjectArtifactPath(path).toLowerCase();
  if (normalized === ".creative-preproduction/private"
    || normalized.startsWith(".creative-preproduction/private/")) {
    throw new Error("Managed asset paths must remain outside the private workspace.");
  }
}

// Resolve the existing ancestor too: a not-yet-created file can still be beneath a junction.
async function canonicalDestination(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(path) === path) throw error;
    return resolve(await canonicalDestination(dirname(path)), basename(path));
  }
}

function isWithin(root: string, path: string): boolean {
  const remainder = relative(root, path);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`));
}

export async function assertManagedAssetLocation(root: string, path: string): Promise<void> {
  assertManagedAssetPath(path);
  const [canonicalRoot, canonicalPrivate, canonicalPath] = await Promise.all([
    realpath(resolve(root)),
    canonicalDestination(resolve(root, ".creative-preproduction/private")),
    canonicalDestination(resolve(root, normalizeProjectArtifactPath(path)))
  ]);
  if (isWithin(canonicalPrivate, canonicalPath)) {
    throw new Error("Managed asset paths must remain outside the private workspace.");
  }
  if (!isWithin(canonicalRoot, canonicalPath)) {
    throw new Error("Managed asset paths must remain inside the project.");
  }
}

function assertAssetInvariants(input: AssetInvariantInput): void {
  if (input.storage.kind === "managed") assertManagedAssetPath(input.storage.path);
  if (input.rightsStatus === "unknown" && input.storage.kind !== "private") {
    throw new Error("Unknown-rights assets require private storage.");
  }
  if (input.rightsStatus === "unknown" && (
    input.providerScopes.length !== 1 || input.providerScopes[0] !== "local-html-svg"
  )) {
    throw new Error("Unknown-rights assets are limited to local HTML/SVG studies.");
  }
  if (input.modificationPolicy === "locked" && input.allowedTreatments.length > 0) {
    throw new Error("Locked assets cannot declare allowed modifications.");
  }
}

function assertCreativeOwner(manifest: ProjectManifest, asset: AssetRecord): void {
  if (asset.creativeOwner !== undefined && !manifest.participants.some(
    (participant) => participant.id === asset.creativeOwner
  )) {
    throw new Error(`Asset creative owner ${asset.creativeOwner} must identify an existing participant.`);
  }
}

function cloneAssetCollections(asset: AssetRecord): AssetRecord {
  return {
    ...asset,
    providerScopes: [...asset.providerScopes],
    storage: asset.storage.kind === "managed"
      ? { kind: "managed", path: asset.storage.path }
      : { kind: "private", ref: asset.storage.ref },
    allowedTreatments: [...asset.allowedTreatments],
    prohibitedTreatments: [...asset.prohibitedTreatments],
    visualNotes: { ...asset.visualNotes },
    relatedArtifactIds: [...asset.relatedArtifactIds],
    relatedFeedbackIds: [...asset.relatedFeedbackIds],
    unresolvedQuestions: [...asset.unresolvedQuestions]
  };
}

export function createAsset(input: CreateAssetInput): AssetRecord {
  const providerScopes = normalizedProviderScopes(input.rightsStatus, input.providerScopes);
  assertAssetInvariants({
    storage: input.storage,
    rightsStatus: input.rightsStatus,
    providerScopes,
    modificationPolicy: input.modificationPolicy,
    allowedTreatments: input.allowedTreatments
  });
  const now = timestamp(input.now);
  return AssetRecordSchema.parse({
    id: input.id,
    title: input.title,
    ...(input.creator === undefined ? {} : { creator: input.creator }),
    source: input.source,
    ...(input.creativeOwner === undefined ? {} : { creativeOwner: input.creativeOwner }),
    intendedRole: input.intendedRole,
    modificationPolicy: input.modificationPolicy,
    rightsStatus: input.rightsStatus,
    providerScopes,
    storage: input.storage.kind === "managed"
      ? { kind: "managed", path: input.storage.path }
      : { kind: "private", ref: input.storage.ref },
    allowedTreatments: [...input.allowedTreatments],
    prohibitedTreatments: [...input.prohibitedTreatments],
    visualNotes: { ...input.visualNotes },
    responsiveGuidance: input.responsiveGuidance,
    accessibilityIntent: input.accessibilityIntent,
    relatedArtifactIds: [],
    relatedFeedbackIds: [],
    unresolvedQuestions: [...input.unresolvedQuestions],
    createdAt: now,
    updatedAt: now
  });
}

export function addAsset(manifest: ProjectManifest, asset: AssetRecord): ProjectManifest {
  if (manifest.assets.some((candidate) => candidate.id === asset.id)) {
    throw new Error(`Asset ${asset.id} already exists.`);
  }
  const normalized = AssetRecordSchema.parse({
    ...asset,
    providerScopes: normalizedProviderScopes(asset.rightsStatus, asset.providerScopes)
  });
  assertAssetInvariants(normalized);
  assertCreativeOwner(manifest, normalized);
  return {
    ...manifest,
    assets: [...manifest.assets, cloneAssetCollections(normalized)]
  };
}

export function updateAsset(
  manifest: ProjectManifest,
  assetId: string,
  changes: UpdateAssetInput,
  now?: Date
): ProjectManifest {
  const current = manifest.assets.find((asset) => asset.id === assetId);
  if (current === undefined) {
    throw new Error(`Asset ${assetId} does not exist.`);
  }

  const rightsStatus = changes.rightsStatus ?? current.rightsStatus;
  const providerScopes = normalizedProviderScopes(
    rightsStatus,
    changes.providerScopes ?? current.providerScopes
  );
  const merged = AssetRecordSchema.parse({
    ...current,
    ...changes,
    providerScopes,
    storage: changes.storage ?? current.storage,
    allowedTreatments: changes.allowedTreatments ?? current.allowedTreatments,
    prohibitedTreatments: changes.prohibitedTreatments ?? current.prohibitedTreatments,
    visualNotes: changes.visualNotes ?? current.visualNotes,
    unresolvedQuestions: changes.unresolvedQuestions ?? current.unresolvedQuestions,
    relatedArtifactIds: [...current.relatedArtifactIds],
    relatedFeedbackIds: [...current.relatedFeedbackIds],
    createdAt: current.createdAt,
    updatedAt: timestamp(now)
  });
  assertAssetInvariants(merged);
  assertCreativeOwner(manifest, merged);
  const updated = cloneAssetCollections(merged);

  return {
    ...manifest,
    assets: manifest.assets.map((asset) => asset.id === assetId ? updated : asset)
  };
}
