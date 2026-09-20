import type { ManjuAssetDraft, ManjuShotDraft } from "../manju-types";
import { assetRegistryName } from "./asset-registry";

function rewriteMentions(text: string, from: string, to: string): string {
  if (!text || !from || from === to) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`@\\[${escaped}\\]`, "g"), `@[${to}]`);
}

function rewriteShotFields(
  shot: ManjuShotDraft,
  pairs: Array<{ from: string; to: string }>,
): ManjuShotDraft {
  let visual = shot.visual;
  let dialogue = shot.dialogue;
  let imagePrompt = shot.imagePrompt;
  let videoPrompt = shot.videoPrompt;
  for (const { from, to } of pairs) {
    visual = rewriteMentions(visual, from, to);
    dialogue = rewriteMentions(dialogue, from, to);
    imagePrompt = rewriteMentions(imagePrompt, from, to);
    videoPrompt = rewriteMentions(videoPrompt, from, to);
  }
  if (
    visual === shot.visual &&
    dialogue === shot.dialogue &&
    imagePrompt === shot.imagePrompt &&
    videoPrompt === shot.videoPrompt
  ) {
    return shot;
  }
  return { ...shot, visual, dialogue, imagePrompt, videoPrompt };
}

/**
 * 资产改名时，级联重写镜头里的 @[旧登记名]。
 * 改本体名时，所有 @[本体/衍生] 也会跟着变。
 */
export function renameAssetInProject(
  assets: ManjuAssetDraft[],
  shots: ManjuShotDraft[],
  assetId: string,
  nextName: string,
): { assets: ManjuAssetDraft[]; shots: ManjuShotDraft[] } {
  const target = assets.find((a) => a.id === assetId);
  if (!target) return { assets, shots };
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === target.name) {
    return {
      assets: assets.map((a) =>
        a.id === assetId ? { ...a, name: nextName } : a,
      ),
      shots,
    };
  }

  const pairs: Array<{ from: string; to: string }> = [];
  const oldSelf = assetRegistryName(target, assets);
  const patchedAssets = assets.map((a) =>
    a.id === assetId ? { ...a, name: trimmed } : a,
  );
  const newSelf = assetRegistryName(
    { ...target, name: trimmed },
    patchedAssets,
  );
  if (oldSelf && newSelf && oldSelf !== newSelf) {
    pairs.push({ from: oldSelf, to: newSelf });
  }
  if (target.name.trim() && target.name.trim() !== trimmed) {
    pairs.push({ from: target.name.trim(), to: trimmed });
  }

  // 本体改名 → 每个衍生的登记名也变
  if (!target.parentId) {
    for (const child of assets.filter((a) => a.parentId === assetId)) {
      const oldChild = assetRegistryName(child, assets);
      const newChild = assetRegistryName(child, patchedAssets);
      if (oldChild && newChild && oldChild !== newChild) {
        pairs.push({ from: oldChild, to: newChild });
      }
    }
  }

  const nextShots = shots.map((s) => rewriteShotFields(s, pairs));
  return { assets: patchedAssets, shots: nextShots };
}
