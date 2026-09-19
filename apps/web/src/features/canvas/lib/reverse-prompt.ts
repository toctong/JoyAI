import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { copyUpstreamPrompt } from "./image-node-actions";
import { mediaRefFromNode } from "./canvas-media-refs";

export const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

type AssetDetail = {
  id: string;
  job?: { prompt?: string | null } | null;
  meta?: Record<string, unknown> | null;
};

async function resolveKnownPrompt(nodeId: string): Promise<string> {
  const { nodes, edges } = useCanvasStore.getState();
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return "";

  const own = String(
    node.data.prompt ?? node.data.panoramaSourcePrompt ?? "",
  ).trim();
  if (own) return own;

  const fromEdges = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodes.find((item) => item.id === edge.source))
    .filter((item) => item?.type === "prompt")
    .map((item) => String(item?.data.prompt ?? "").trim())
    .filter(Boolean);
  if (fromEdges.length) return fromEdges.join("\n\n");

  const assetId = String(node.data.assetId ?? "").trim();
  if (!assetId) return "";
  try {
    const asset = await api<AssetDetail>(`/assets/${assetId}`);
    const jobPrompt = String(asset.job?.prompt ?? "").trim();
    if (jobPrompt) return jobPrompt;
    const metaPrompt = String(asset.meta?.prompt ?? "").trim();
    if (metaPrompt) return metaPrompt;
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Reverse / extract prompt beside an image node.
 * Prefer known generation prompts; otherwise spawn a reverse-instruction graph.
 */
export async function spawnReversePrompt(nodeId: string) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.type !== "image" && node.type !== "panorama") {
    toast.message("仅图片节点支持反推提示词");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法反推提示词");
    return;
  }

  const known = await resolveKnownPrompt(nodeId);
  store.pushHistory();
  const gap = 48;
  const width = node.width ?? 240;

  if (known) {
    const textId = store.addNode("text", {
      x: node.x + width + gap,
      y: node.y,
    });
    store.updateNodeData(textId, {
      text: known,
      title: "提取的提示词",
      fontSize: 14,
    });
    store.addEdge(node.id, textId);
    store.setSelection([textId]);
    toast.success("已提取原提示词");
    return;
  }

  const textId = store.addNode("text", {
    x: node.x + width + gap,
    y: node.y,
  });
  store.updateNodeData(textId, {
    text: IMAGE_PROMPT_REVERSE_PRESET,
    title: "反推提示词",
    fontSize: 14,
  });
  store.addEdge(node.id, textId);

  const refs = mediaRefFromNode(node);
  const promptId = store.addNode("prompt", {
    x: node.x + width + gap,
    y: node.y + 120,
  });
  store.updateNodeData(promptId, {
    prompt: IMAGE_PROMPT_REVERSE_PRESET,
    operation: "generate",
    outputKind: "image",
    title: "反推提示词",
    ...refs,
  });
  store.addEdge(node.id, promptId);
  store.addEdge(textId, promptId);
  store.setSelection([promptId]);
  toast.message("已创建反推节点：运行后可把结果复制到文本");
}

/** Copy prompt when available; otherwise open reverse workflow. */
export function reverseOrCopyPrompt(nodeId: string) {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
  const own = String(node?.data.prompt ?? "").trim();
  if (own) {
    copyUpstreamPrompt(nodeId);
    return;
  }
  void spawnReversePrompt(nodeId);
}
