import { loadCanvasImage } from "./load-canvas-image";
import { uploadFileToNewNode } from "./upload-to-node";
import { useCanvasStore } from "../store";
import { toast } from "@/shared/lib/toast";

export async function rotateImageUrl(
  src: string,
  deg: 90 | 180 | 270,
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadCanvasImage(src);
  const swap = deg === 90 || deg === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? image.naturalHeight : image.naturalWidth;
  canvas.height = swap ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法旋转图片");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("旋转失败"))),
      "image/png",
    );
  });
  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Bake rotation and spawn a sibling image/panorama node (upload on apply only).
 */
export async function spawnRotatedImage(
  nodeId: string,
  payload: {
    blob: Blob;
    deg: 90 | 180 | 270;
  },
) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || (node.type !== "image" && node.type !== "panorama")) {
    toast.message("仅图片节点支持旋转");
    return;
  }

  const file = new File([payload.blob], `rotate-${payload.deg}.png`, {
    type: "image/png",
  });
  const width = node.width ?? 240;
  const newId = await uploadFileToNewNode(
    file,
    {
      x: node.x + width + 48,
      y: node.y,
    },
    {
      preferredType: node.type === "panorama" ? "panorama" : "image",
      title: `旋转 ${payload.deg}°`,
    },
  );
  store.addEdge(nodeId, newId);
  store.setSelection([newId]);
  toast.success(`已创建旋转 ${payload.deg}° 节点`);
}
