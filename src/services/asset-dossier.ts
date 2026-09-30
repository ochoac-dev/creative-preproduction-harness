import type { AssetRecord, ProjectManifest } from "../domain/schema.js";
import { ProjectStore } from "../storage/project-store.js";

function compareCodePoints(left: string, right: string): number {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  for (;;) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      return leftNext.done === rightNext.done ? 0 : leftNext.done ? -1 : 1;
    }
    const leftCodePoint = leftNext.value.codePointAt(0)!;
    const rightCodePoint = rightNext.value.codePointAt(0)!;
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }
}

function bulletList(values: string[]): string {
  return values.length === 0 ? "- None" : values.map((value) => `- ${value}`).join("\n");
}

function visualNotes(notes: AssetRecord["visualNotes"]): string {
  const entries = Object.entries(notes).sort(([left], [right]) => compareCodePoints(left, right));
  return entries.length === 0
    ? "- None"
    : entries.map(([label, value]) => `- ${label}: ${value}`).join("\n");
}

function renderAsset(asset: AssetRecord): string {
  return `## ${asset.id}: ${asset.title}

**Intended role:** ${asset.intendedRole}
**Creative owner:** ${asset.creativeOwner ?? "Unassigned"}
**Modification policy:** ${asset.modificationPolicy}
**Rights status:** ${asset.rightsStatus}
**Provider scopes:** ${asset.providerScopes.join(", ") || "None"}

### Allowed treatments

${bulletList(asset.allowedTreatments)}

### Prohibited treatments

${bulletList(asset.prohibitedTreatments)}

### Responsive guidance

${asset.responsiveGuidance}

### Accessibility intent

${asset.accessibilityIntent}

### Visual notes

${visualNotes(asset.visualNotes)}

### Open questions

${bulletList(asset.unresolvedQuestions)}`;
}

export function renderAssetDossier(manifest: ProjectManifest): string {
  const sections = [...manifest.assets]
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map(renderAsset);
  return [
    "# Asset Dossier",
    "",
    "Creative and rights guidance for supplied project assets. Storage references and source filenames are intentionally excluded.",
    ...(sections.length === 0 ? ["", "No supplied assets have been registered."] : ["", ...sections])
  ].join("\n").concat("\n");
}

export async function writeAssetDossier(root: string, manifest: ProjectManifest): Promise<void> {
  await new ProjectStore(root).writeAssetDossier(manifest);
}
