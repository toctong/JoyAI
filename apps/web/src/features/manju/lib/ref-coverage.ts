import type { ManjuAssetDraft, ManjuProjectDraft, ManjuShotDraft } from "../manju-types";

/** 画外音 / 无可视形象：定妆与参考图覆盖率可跳过 */
export function isVoiceOnlyAsset(asset: ManjuAssetDraft): boolean {
  if (asset.voiceOnly === true) return true;
  if (asset.kind !== "character") return false;
  const blob = [
    asset.description,
    asset.detail?.roleType,
    asset.detail?.traits,
    asset.detail?.story,
  ]
    .filter(Boolean)
    .join(" ");
  return /画外|旁白|只闻其声|不露面|未正面出场|未出场/.test(blob);
}

export function assetNeedsRefImage(asset: ManjuAssetDraft): boolean {
  if (asset.kind !== "character" && asset.kind !== "scene" && asset.kind !== "prop") {
    return false;
  }
  if (asset.kind === "character" && isVoiceOnlyAsset(asset)) return false;
  return true;
}

export function assetHasRefImage(asset: ManjuAssetDraft): boolean {
  return Boolean(asset.imageUrl || asset.assetId);
}

/** 本集镜头引用的资产中，需要参考图的覆盖情况 */
export function episodeRefCoverage(
  project: ManjuProjectDraft,
  shots: ManjuShotDraft[],
): {
  needed: ManjuAssetDraft[];
  withImage: ManjuAssetDraft[];
  missing: ManjuAssetDraft[];
  ratio: number;
} {
  const ids = new Set(shots.flatMap((s) => s.assetRefs ?? []));
  const linked = project.assets.filter((a) => ids.has(a.id));
  const needed = linked.filter(assetNeedsRefImage);
  const withImage = needed.filter(assetHasRefImage);
  const missing = needed.filter((a) => !assetHasRefImage(a));
  const ratio = needed.length === 0 ? 1 : withImage.length / needed.length;
  return { needed, withImage, missing, ratio };
}
