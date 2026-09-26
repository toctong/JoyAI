import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";

const PANORAMA_SEED =
  "基于参考图生成可环视的 720° 等距柱状全景，比例 2:1，左右边缘无缝衔接";

/** Spawn a panorama generate prompt beside the image and wire the edge. */
export function spawnPanoramaPrompt(nodeId: string, modelId?: string) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || (node.type !== "image" && node.type !== "panorama")) {
    toast.message("仅图片节点支持转720°全景");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法转720°全景");
    return;
  }

  store.pushHistory();
  const width = node.width ?? 240;
  const refs = mediaRefFromNode(node);
  const promptId = store.addNode("prompt", {
    x: node.x + width + 48,
    y: node.y,
  });
  store.updateNodeData(promptId, {
    prompt: PANORAMA_SEED,
    operation: "generate",
    outputKind: "panorama",
    title: "转720°全景",
    ...(modelId ? { genModelId: modelId } : {}),
    ...refs,
  });
  store.addEdge(node.id, promptId);
  store.setSelection([promptId]);
  toast.success("已创建720°全景提示词节点");
}
