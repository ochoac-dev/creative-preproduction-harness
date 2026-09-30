import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProjectManifest } from "../domain/schema.js";
import {
  normalizeProjectArtifactPath,
  requirePersistedPrivateArtifactPath
} from "../domain/artifact-path.js";
import { evaluateManifestPolicy } from "../domain/policy.js";
import { assertManagedAssetLocation } from "./assets.js";

export type ExtensionDiagnosticCode =
  | "asset-private-reference"
  | "asset-rights-blocked"
  | "asset-provider-blocked"
  | "feedback-target-missing"
  | "feedback-condition-open"
  | "decision-owner-approval-missing"
  | "provisional-in-handoff"
  | "private-file-missing"
  | "tracked-path-unsafe";

export interface Diagnostic {
  code:
    | "artifact-file-missing"
    | "reference-license-unknown"
    | "approval-artifact-missing"
    | "approval-version-missing"
    | "duplicate-artifact-version"
    | ExtensionDiagnosticCode;
  severity: "error" | "warning";
  message: string;
  subjectId: string;
}

function artifactVersionKey(id: string, version: number): string {
  return `${id}\0${version}`;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  if (left.code !== right.code) {
    return left.code < right.code ? -1 : 1;
  }
  if (left.subjectId === right.subjectId) {
    return 0;
  }
  return left.subjectId < right.subjectId ? -1 : 1;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function feedbackTargetExists(manifest: ProjectManifest, feedbackIndex: number): boolean {
  const target = manifest.feedback[feedbackIndex]?.target;
  if (target === undefined) {
    return false;
  }
  if (target.kind === "project") {
    return target.id === manifest.project.id;
  }
  if (target.kind === "asset") {
    return manifest.assets.some((asset) => asset.id === target.id);
  }
  return manifest.artifacts.some((artifact) =>
    artifact.id === target.id && (target.version === undefined || artifact.version === target.version)
  );
}

export async function validateProject(
  root: string,
  manifest: ProjectManifest
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const artifactIds = new Set<string>();
  const artifactVersions = new Set<string>();
  const duplicateVersions = new Set<string>();

  for (const artifact of manifest.artifacts) {
    artifactIds.add(artifact.id);
    const key = artifactVersionKey(artifact.id, artifact.version);
    if (artifactVersions.has(key) && !duplicateVersions.has(key)) {
      diagnostics.push({
        code: "duplicate-artifact-version",
        severity: "error",
        subjectId: artifact.id,
        message: `Artifact "${artifact.id}" has duplicate version ${artifact.version}.`
      });
      duplicateVersions.add(key);
    }
    artifactVersions.add(key);

    let normalizedPath: string;
    try {
      normalizedPath = artifact.visibility === "private"
        ? requirePersistedPrivateArtifactPath(artifact.path)
        : normalizeProjectArtifactPath(artifact.path);
      if (normalizedPath !== artifact.path.replaceAll("\\", "/")) {
        throw new Error("Tracked artifact path must be normalized");
      }
    } catch {
      diagnostics.push({
        code: "tracked-path-unsafe",
        severity: "error",
        subjectId: artifact.id,
        message: `Tracked artifact ${artifact.id} v${artifact.version} has an unsafe project path.`
      });
      continue;
    }

    if (!await isFile(resolve(root, normalizedPath))) {
      diagnostics.push(artifact.visibility === "private"
        ? {
            code: "private-file-missing",
            severity: "warning",
            subjectId: artifact.id,
            message: `Private artifact file "${artifact.path}" does not exist.`
          }
        : {
            code: "artifact-file-missing",
            severity: "error",
            subjectId: artifact.id,
            message: `Artifact file "${artifact.path}" does not exist.`
          });
    }
  }

  for (const approval of manifest.approvals) {
    if (!artifactIds.has(approval.artifactId)) {
      diagnostics.push({
        code: "approval-artifact-missing",
        severity: "error",
        subjectId: approval.id,
        message: `Approval targets missing artifact "${approval.artifactId}".`
      });
    } else if (!artifactVersions.has(artifactVersionKey(approval.artifactId, approval.artifactVersion))) {
      diagnostics.push({
        code: "approval-version-missing",
        severity: "error",
        subjectId: approval.id,
        message: `Approval targets missing version ${approval.artifactVersion} of artifact "${approval.artifactId}".`
      });
    }
  }

  for (const reference of manifest.references) {
    if (reference.licenseStatus === "unknown") {
      diagnostics.push({
        code: "reference-license-unknown",
        severity: "warning",
        subjectId: reference.id,
        message: `Reference licensing is unknown: ${reference.licenseNotes}`
      });
    }
  }

  for (let index = 0; index < manifest.feedback.length; index += 1) {
    const feedback = manifest.feedback[index];
    if (feedback !== undefined && !feedbackTargetExists(manifest, index)) {
      diagnostics.push({
        code: "feedback-target-missing",
        severity: "warning",
        subjectId: feedback.id,
        message: feedback.target === undefined
          ? `Feedback ${feedback.id} does not identify a target.`
          : `Feedback ${feedback.id} targets a missing ${feedback.target.kind} ${feedback.target.id}.`
      });
    }
  }

  for (const asset of manifest.assets) {
    if (asset.storage.kind === "private") {
      const privateSource = resolve(
        root,
        ".creative-preproduction",
        "private",
        "assets",
        asset.storage.ref,
        "source"
      );
      if (!await isFile(privateSource)) {
        diagnostics.push({
          code: "private-file-missing",
          severity: "warning",
          subjectId: asset.id,
          message: `Private source for asset ${asset.id} is missing.`
        });
      }
      continue;
    }
    try {
      const normalizedPath = normalizeProjectArtifactPath(asset.storage.path);
      await assertManagedAssetLocation(root, normalizedPath);
      if (normalizedPath !== asset.storage.path.replaceAll("\\", "/")) {
        throw new Error("Tracked asset path must be normalized");
      }
    } catch {
      diagnostics.push({
        code: "tracked-path-unsafe",
        severity: "error",
        subjectId: asset.id,
        message: `Tracked asset ${asset.id} has an unsafe project path.`
      });
    }
  }

  for (const issue of evaluateManifestPolicy(manifest)) {
    diagnostics.push({
      code: issue.code,
      severity: "error",
      subjectId: issue.subjectId,
      message: issue.message
    });
  }

  return diagnostics.sort(compareDiagnostics);
}
