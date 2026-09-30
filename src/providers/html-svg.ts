import { open, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";
import type { ArtifactRecord, AssetRecord, ProjectManifest } from "../domain/schema.js";
import { canUseAssetWithProvider } from "../domain/policy.js";
import { createProvisionalArtifact } from "../services/provisional.js";
import { publishFileAtomically, type PublicationOwnership } from "../storage/atomic-file.js";
import {
  assertNoLinkedPrivateAncestors,
  ensureSecurePrivateDirectory,
  verifyCanonicalPrivateDirectory
} from "../storage/private-safety.js";
import { PrivateWorkspace } from "../storage/private-workspace.js";

export interface PrivateHtmlStudyInput {
  id: string;
  title: string;
  question: string;
  rationale: string;
  assumptions: string[];
  assetIds: string[];
  compositionNotes: string[];
  now?: Date;
}

interface RenderAsset {
  asset: AssetRecord;
  localUrl?: string;
}

function withoutNetworkReferences(value: string): string {
  return value
    .replace(/\bhttps?:\/\/[^\s<>"']+/giu, "[external reference omitted]")
    .replace(/\/\/[^\s<>"']+/gu, "[external reference omitted]");
}

function escapeHtml(value: string): string {
  return withoutNetworkReferences(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function list(items: string[], emptyLabel: string): string {
  const values = items.length > 0 ? items : [emptyLabel];
  return `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function projectAssetPath(root: string, path: string): string {
  const portable = path.replaceAll("\\", "/");
  const candidate = resolve(root, path);
  const fromRoot = relative(resolve(root), candidate);
  if (
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    posix.isAbsolute(portable) ||
    portable.split("/").some((part) => part === "..") ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`Managed asset path ${path} must remain inside the project.`);
  }
  return candidate;
}

async function renderAsset(
  root: string,
  workspace: PrivateWorkspace,
  studyDirectory: string,
  asset: AssetRecord
): Promise<RenderAsset> {
  const localPath = asset.storage.kind === "private"
    ? workspace.resolveRef(asset.storage.ref)
    : projectAssetPath(root, asset.storage.path);
  if (asset.storage.kind === "private") {
    await assertNoLinkedPrivateAncestors(root, localPath);
  }
  if (await isReadableSupportedImage(localPath)) {
    return {
      asset,
      localUrl: relative(studyDirectory, localPath).split(sep).join("/")
    };
  }
  return { asset };
}

function hasSupportedImageSignature(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )) {
    return true;
  }
  const prefix = bytes.toString("utf8");
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) {
    return true;
  }
  if (bytes.length >= 12 && prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") {
    return true;
  }
  return /^(?:\uFEFF|\s)*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(prefix);
}

async function isReadableSupportedImage(path: string): Promise<boolean> {
  let file: FileHandle | undefined;
  try {
    file = await open(path, "r");
    if (!(await file.stat()).isFile()) {
      return false;
    }
    const bytes = Buffer.alloc(512);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return hasSupportedImageSignature(bytes.subarray(0, bytesRead));
  } catch (error: unknown) {
    if (["ENOENT", "EACCES", "EPERM", "EISDIR"].includes(
      (error as NodeJS.ErrnoException).code ?? ""
    )) {
      return false;
    }
    throw error;
  } finally {
    await file?.close();
  }
}

function assetVisual(rendered: RenderAsset): string {
  const { asset, localUrl } = rendered;
  if (localUrl !== undefined) {
    return `<img src="${escapeHtml(localUrl)}" alt="${escapeHtml(asset.accessibilityIntent)}">`;
  }
  return `<svg class="asset-fallback" role="img" aria-label="${escapeHtml(asset.accessibilityIntent)}" viewBox="0 0 800 500">
          <rect width="800" height="500" fill="#dedbd2"></rect>
          <path d="M80 390 250 210l130 120 120-160 220 220Z" fill="#aaa69c"></path>
          <text x="400" y="450" text-anchor="middle">Local preview unavailable</text>
        </svg>`;
}

function assetCard(rendered: RenderAsset): string {
  const asset = rendered.asset;
  return `<article class="asset-card">
      <figure>${assetVisual(rendered)}</figure>
      <div class="asset-copy">
        <p class="eyebrow">${escapeHtml(asset.id)} · ${escapeHtml(asset.rightsStatus)} rights</p>
        <h3>${escapeHtml(asset.title)}</h3>
        <p><strong>Intended role:</strong> ${escapeHtml(asset.intendedRole)}</p>
        <p><strong>Source:</strong> ${escapeHtml(asset.source)}</p>
        <p><strong>Permission:</strong> ${escapeHtml(asset.modificationPolicy)}; ${escapeHtml(asset.rightsStatus)}</p>
        <p><strong>Responsive guidance:</strong> ${escapeHtml(asset.responsiveGuidance)}</p>
        <p><strong>Allowed:</strong> ${escapeHtml(asset.allowedTreatments.join(", ") || "None documented")}</p>
        <p><strong>Prohibited:</strong> ${escapeHtml(asset.prohibitedTreatments.join(", ") || "None documented")}</p>
      </div>
    </article>`;
}

function document(input: PrivateHtmlStudyInput, assets: RenderAsset[]): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)} — Private provisional study</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; background: #f4f1e8; color: #171717; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .warning { padding: 14px 24px; background: #171717; color: #fff; font-weight: 700; letter-spacing: .12em; text-align: center; }
    main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 80px; }
    .eyebrow { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { max-width: 14ch; font-size: clamp(2.4rem, 7vw, 6rem); line-height: .94; margin: 12px 0 48px; }
    h2, h3, p { margin-top: 0; }
    .decision-grid, .asset-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; }
    .decision-grid { border-block: 1px solid #171717; padding: 32px 0; }
    .asset-card { padding: 48px 0; border-bottom: 1px solid #171717; align-items: start; }
    figure { margin: 0; min-height: 260px; background: #dedbd2; }
    img, svg { display: block; width: 100%; height: auto; }
    ul { padding-left: 1.2rem; }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 680px); padding-top: 36px; }
      .decision-grid, .asset-card { grid-template-columns: 1fr; gap: 20px; }
      h1 { margin-bottom: 32px; }
    }
  </style>
</head>
<body>
  <div class="warning">PRIVATE PROVISIONAL STUDY</div>
  <main>
    <p class="eyebrow">Composition study · local HTML/SVG preview</p>
    <h1>${escapeHtml(input.title)}</h1>
    <section class="decision-grid" aria-labelledby="question-heading">
      <div>
        <p class="eyebrow">Creative question</p>
        <h2 id="question-heading">${escapeHtml(input.question)}</h2>
        <p>${escapeHtml(input.rationale)}</p>
      </div>
      <div>
        <h3>Assumptions</h3>
        ${list(input.assumptions, "No assumptions documented.")}
        <h3>Composition guidance</h3>
        ${list(input.compositionNotes, "No additional composition notes.")}
      </div>
    </section>
    <section aria-label="Asset guidance">
      ${assets.map(assetCard).join("\n")}
    </section>
  </main>
</body>
</html>
`;
}

export async function createPrivateHtmlStudy(
  root: string,
  manifest: ProjectManifest,
  input: PrivateHtmlStudyInput
): Promise<{ artifact: ArtifactRecord; previewPath: string; ownership: PublicationOwnership }> {
  const assets = input.assetIds.map((assetId) => {
    const asset = manifest.assets.find((candidate) => candidate.id === assetId);
    if (asset === undefined) {
      throw new Error(`Referenced asset ${assetId} does not exist in the project manifest.`);
    }
    const policy = canUseAssetWithProvider(asset, "local-html-svg");
    if (!policy.allowed) {
      throw new Error(`Cannot create private study: ${policy.reasons.join(" ")}`);
    }
    return asset;
  });
  const workspace = new PrivateWorkspace(root);
  await workspace.initialize();
  const studyDirectory = workspace.studyDirectory(input.id, 1);
  const previewFile = resolve(studyDirectory, "index.html");
  const previewPath = relative(resolve(root), previewFile).split(sep).join("/");
  if (manifest.artifacts.some((artifact) => artifact.path === previewPath ||
    (artifact.id === input.id && artifact.version === 1))) {
    throw new Error(`Private study ${input.id} v1 already exists.`);
  }
  await ensureSecurePrivateDirectory(root, studyDirectory);
  const renderedAssets = await Promise.all(
    assets.map((asset) => renderAsset(root, workspace, studyDirectory, asset))
  );
  const blockers = assets
    .filter((asset) => asset.rightsStatus === "unknown")
    .map((asset) => `${asset.id} rights remain unknown.`);
  const artifact = createProvisionalArtifact({
    id: input.id,
    kind: "composition-study",
    path: previewPath,
    question: input.question,
    rationale: input.rationale,
    assumptions: input.assumptions,
    blockers,
    assetIds: input.assetIds,
    provider: "local-html-svg",
    ...(input.now === undefined ? {} : { now: input.now })
  });

  const ownership = await publishFileAtomically(
    previewFile,
    (temporaryPath) => writeFile(
      temporaryPath,
      document(input, renderedAssets),
      { encoding: "utf8", flag: "wx" }
    ),
    {
      collisionMessage: `Private study ${input.id} v1 already exists.`,
      reuseIdentical: true,
      verifyParent: async () => {
        await assertNoLinkedPrivateAncestors(root, dirname(previewFile));
        await verifyCanonicalPrivateDirectory(root, studyDirectory);
      }
    }
  );
  return { artifact, previewPath, ownership };
}
