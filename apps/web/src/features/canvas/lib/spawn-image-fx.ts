import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";
import {
  IMAGE_FX_DEFS,
  buildImageFxPrompt,
  type ImageFxMode,
} from "./image-fx";

/** Spawn an image-to-image prompt node for lineart / colorize / character sheet. */
export function spawnImageFx(
  nodeId: string,
  payload: {
    mode: ImageFxMode;
    note?: string;
    stylePrompt?: string | null;
    modelId?: string;
  },
) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || node.type !== "image") {
    toast.message("仅图像节点支持该功能");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法生成");
    return;
  }

  const def = IMAGE_FX_DEFS[payload.mode];
  const prompt = buildImageFxPrompt(
    payload.mode,
    payload.note ?? "",
    payload.stylePrompt,
  );

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
    title: def.title,
    genRatio: def.ratio,
    ...(payload.modelId ? { genModelId: payload.modelId } : {}),
    ...refs,
  });
  store.addEdge(node.id, promptId);
  store.setSelection([promptId]);
  toast.success(`已创建「${def.title}」提示词节点`);
}
