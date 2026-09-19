import type { CanvasNode } from "@joyai/shared";
import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";

type SavedAsset = {
  id: string;
  url: string;
  kind: string;
  reused?: boolean;
};

/** Persist the selected canvas node into the user asset library. */
export async function saveNodeAsset(nodeId: string) {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
  if (!node) return;

  try {
    if (node.type === "text") {
      const text = String(node.data.text ?? "").trim();
      if (!text || text === "双击编辑文本") {
        toast.error("没有可保存的文本");
        return;
      }
      await api<SavedAsset>("/assets/save", {
        method: "POST",
        body: {
          kind: "text",
          text,
          meta: { source: "canvas", nodeId: node.id },
        },
      });
      toast.success("已加入我的素材");
      return;
    }

    if (
      node.type !== "image" &&
      node.type !== "video" &&
      node.type !== "panorama" &&
      node.type !== "audio"
    ) {
      toast.error("当前节点无法存为素材");
      return;
    }

    const url = String(node.data.url ?? "").trim();
    const assetId = String(node.data.assetId ?? "").trim();
    if (!url && !assetId) {
      toast.error("没有可保存的媒体");
      return;
    }

    const kind =
      node.type === "video"
        ? "video"
        : node.type === "audio"
          ? "audio"
          : "image";

    const saved = await api<SavedAsset>("/assets/save", {
      method: "POST",
      body: {
        assetId: assetId || undefined,
        url: assetId ? undefined : url,
        kind,
        width: node.width,
        height: node.height,
        meta: {
          source: "canvas",
          nodeId: node.id,
          prompt: String(node.data.prompt ?? "").trim() || undefined,
          originalName:
            String(node.data.fileName ?? "").trim() ||
            String(node.data.title ?? "").trim() ||
            undefined,
        },
      },
    });

    if (saved.id && saved.id !== assetId) {
      useCanvasStore.getState().updateNodeData(node.id, {
        assetId: saved.id,
        url: saved.url || url,
      });
    }

    toast.success(saved.reused ? "已在素材库中" : "已加入我的素材");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "加入素材失败");
  }
}

export function canSaveNodeAsset(node: CanvasNode | undefined) {
  if (!node) return false;
  if (node.type === "text") {
    const text = String(node.data.text ?? "").trim();
    return Boolean(text && text !== "双击编辑文本");
  }
  if (
    node.type === "image" ||
    node.type === "video" ||
    node.type === "panorama" ||
    node.type === "audio"
  ) {
    return Boolean(
      String(node.data.url ?? "").trim() ||
        String(node.data.assetId ?? "").trim(),
    );
  }
  return false;
}
