import type { ManjuAssetDraft } from "../manju-types";

const KIND_LABEL: Record<ManjuAssetDraft["kind"], string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

/** 登记名：本体 `名`；衍生 `本体/衍生` */
export function assetRegistryName(
  asset: ManjuAssetDraft,
  assets: ManjuAssetDraft[],
): string {
  const name = asset.name.trim();
  if (!asset.parentId) return name;
  const parent = assets.find((a) => a.id === asset.parentId);
  const parentName = parent?.name.trim() || "未命名";
  return `${parentName}/${name || "衍生"}`;
}

export function assetDisplayLabel(
  asset: ManjuAssetDraft,
  assets: ManjuAssetDraft[],
): string {
  const reg = assetRegistryName(asset, assets);
  return `${KIND_LABEL[asset.kind]}·${reg}`;
}

/** 按登记名 / 别名 / 本体名解析资产 */
export function findAssetByMention(
  mention: string,
  assets: ManjuAssetDraft[],
): ManjuAssetDraft | undefined {
  const key = mention.trim();
  if (!key) return undefined;
  for (const a of assets) {
    if (assetRegistryName(a, assets) === key) return a;
    if (a.name.trim() === key) return a;
    if ((a.aliases ?? []).some((al) => al.trim() === key)) return a;
  }
  return undefined;
}

export function rootAssets(
  assets: ManjuAssetDraft[],
  kind?: ManjuAssetDraft["kind"],
): ManjuAssetDraft[] {
  return assets.filter(
    (a) => !a.parentId && (kind == null || a.kind === kind),
  );
}

export function childAssets(
  assets: ManjuAssetDraft[],
  parentId: string,
): ManjuAssetDraft[] {
  return assets.filter((a) => a.parentId === parentId);
}

/** 删除本体时一并带走衍生 id */
export function collectAssetIdsToRemove(
  assets: ManjuAssetDraft[],
  assetId: string,
): Set<string> {
  const ids = new Set<string>([assetId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of assets) {
      if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) {
        ids.add(a.id);
        grew = true;
      }
    }
  }
  return ids;
}
