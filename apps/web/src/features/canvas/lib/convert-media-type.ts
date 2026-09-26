import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { flagPanoramaAspect } from "./panorama-prompt";
import { toast } from "@/shared/lib/toast";

type Box = { x: number; y: number; width: number; height: number };

function boxOf(node: CanvasNode): Box {
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? 340,
    height: node.height ?? 240,
  };
}

function readBox(value: unknown): Box | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const box = value as Partial<Box>;
  if (
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number"
  ) {
    return null;
  }
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

/**
 * Switch image ↔ panorama.
 * Keep the current node box when entering panorama so portrait media
 * is not forced into a landscape 2:1 frame. Restoring image uses imageBox.
 */
export function convertImagePanoramaType(
  nodeId: string,
  to: "image" | "panorama",
) {
  const state = useCanvasStore.getState();
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.type === to) return;
  if (node.type !== "image" && node.type !== "panorama") return;

  const current = boxOf(node);
  const data = { ...node.data };
  let next = current;

  if (to === "panorama") {
    data.projection = "equirectangular";
    delete data.aspectHint;
    if (!readBox(data.imageBox)) data.imageBox = current;
    // Preserve portrait/square footprint; only normalize already-wide nodes to 2:1.
    next = panoramaStage(current);
  } else {
    const saved = readBox(data.imageBox);
    delete data.projection;
    delete data.aspectHint;
    delete data.imageBox;
    if (saved) next = saved;
  }

  useCanvasStore.setState((s) => ({
    nodes: s.nodes.map((item) =>
      item.id === nodeId
        ? {
            ...item,
            type: to as CanvasNodeType,
            x: next.x,
            y: next.y,
            width: next.width,
            height: next.height,
            data,
          }
        : item,
    ),
    dirty: true,
  }));

  if (to === "panorama") {
    const url = String(data.url ?? "");
    if (url && !url.startsWith("data:")) {
      flagPanoramaAspect(url, (aspectHint) => {
        useCanvasStore.getState().updateNodeData(nodeId, { aspectHint });
        if (aspectHint === "non-2:1") {
          toast.message("当前图不是 2:1，环视会按球体贴图，可能变形");
        }
      });
    }
  }

  toast.success(to === "panorama" ? "已转为720°全景节点" : "已转为图像节点");
}

/** Prefer keeping the source box; only force 2:1 when already landscape-wide. */
function panoramaStage(from: Box): Box {
  if (from.width < from.height * 1.4) {
    return { ...from };
  }
  const width = Math.max(320, from.width);
  const height = Math.round(width / 2);
  return {
    width,
    height,
    x: from.x + from.width / 2 - width / 2,
    y: from.y + from.height / 2 - height / 2,
  };
}
