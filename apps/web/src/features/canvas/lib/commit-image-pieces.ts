import type { CanvasNode } from "@joyai/shared";
import type { RasterPiece } from "./image-raster";
import { useCanvasStore } from "../store";
import { apiUpload } from "@/shared/lib/api";
import { mediaNamePatch } from "./node-title";

/** Upload raster pieces as Assets and place image nodes to the right of the source. */
export async function commitImagePieces(
  source: CanvasNode,
  pieces: RasterPiece[],
) {
  if (!pieces.length) return;
  const store = useCanvasStore.getState();
  store.pushHistory();
  const cellW = source.width ?? 240;
  const gap = 28;
  const originX = source.x + cellW + 48;
  const ids: string[] = [];

  for (const piece of pieces) {
    const file = new File([piece.blob], piece.name, { type: "image/png" });
    const asset = await apiUpload<{ id: string; url: string }>("/upload", file);
    const aspect = piece.pixelWidth / Math.max(1, piece.pixelHeight);
    const height = Math.max(88, Math.round(cellW / aspect));
    const id = store.addNode("image", {
      x: originX + piece.col * (cellW + gap),
      y: source.y + piece.row * (height + gap),
    });
    store.updateNode(id, { width: cellW, height });
    store.updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
      ...mediaNamePatch(piece.name),
      title: piece.title,
      prompt: String(source.data.prompt ?? "").trim() || undefined,
    });
    store.addEdge(source.id, id);
    ids.push(id);
  }

  store.setSelection(ids);
}
