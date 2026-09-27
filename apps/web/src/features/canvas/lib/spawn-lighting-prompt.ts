import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";

/** Spawn a generate prompt that relights the source image. */
export function spawnLightingPrompt(
  nodeId: string,
  prompt: string,
  modelId?: string,
) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || (node.type !== "image" && node.type !== "panorama")) {
    toast.message("仅图片节点支持打光");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法打光");
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
    prompt,
    operation: "generate",
    outputKind: "image",
    title: "打光",
    ...(modelId ? { genModelId: modelId } : {}),
    ...refs,
  });
  store.addEdge(node.id, promptId);
  store.setSelection([promptId]);
  toast.success("已创建打光提示词节点");
}
