import type { CanvasNode } from "@joyai/shared";
import type { RasterPiece } from "./image-raster";
import { useCanvasStore } from "../store";
import { uploadFileToNewNode } from "./upload-to-node";

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

  await Promise.all(
    pieces.map(async (piece) => {
      const file = new File([piece.blob], piece.name, { type: "image/png" });
      const aspect = piece.pixelWidth / Math.max(1, piece.pixelHeight);
      const height = Math.max(88, Math.round(cellW / aspect));
      const id = await uploadFileToNewNode(
        file,
        {
          x: originX + piece.col * (cellW + gap),
          y: source.y + piece.row * (height + gap),
        },
        {
          history: false,
          preferredType: "image",
          title: piece.title,
        },
      );
      store.updateNode(id, { width: cellW, height });
      const prompt = String(source.data.prompt ?? "").trim();
      if (prompt) {
        store.updateNodeData(id, { prompt });
      }
      store.addEdge(source.id, id);
      ids.push(id);
    }),
  );

  store.setSelection(ids);
}
