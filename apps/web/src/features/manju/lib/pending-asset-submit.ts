/** 资产图提交中（已标 busy、尚未绑上 jobId）——对账勿清 */
const pendingAssetIds = new Set<string>();

export function markManjuAssetSubmitPending(assetId: string) {
  pendingAssetIds.add(assetId);
}

export function clearManjuAssetSubmitPending(assetId: string) {
  pendingAssetIds.delete(assetId);
}

export function isManjuAssetSubmitPending(assetId: string) {
  return pendingAssetIds.has(assetId);
}
