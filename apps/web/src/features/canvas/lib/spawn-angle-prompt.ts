import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";
import {
  buildAngleLabel,
  buildAnglePrompt,
  type ImageAngleParams,
} from "./angle-prompt";

/** Spawn an image-edit prompt for a new camera angle. */
export function spawnAnglePrompt(
  nodeId: string,
  params: ImageAngleParams,
  modelId?: string,
) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || (node.type !== "image" && node.type !== "panorama")) {
    toast.message("仅图片节点支持多角度");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法生成多角度");
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
    prompt: buildAnglePrompt(params),
    operation: "generate",
    outputKind: "image",
    title: buildAngleLabel(params),
    ...(modelId ? { genModelId: modelId } : {}),
    ...refs,
  });
  store.addEdge(node.id, promptId);
  store.setSelection([promptId]);
  toast.success("已创建多角度提示词节点");
}
