import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { CANVAS_NODE_SIZE, CANVAS_TEXT_FONT } from "@/shared/theme";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";

/** Same instruction as infinite-canvas `IMAGE_PROMPT_REVERSE_PRESET`. */
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
 * Known prompts are copied onto a text node. Otherwise a text node keeps the
 * built-in instruction and an LLM job writes the result into a sibling text node.
 */
export async function spawnReversePrompt(
  nodeId: string,
  modelId?: string,
) {
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
    store.updateNode(textId, { ...CANVAS_NODE_SIZE.text });
    store.updateNodeData(textId, {
      text: known,
      title: "提取的提示词",
      fontSize: CANVAS_TEXT_FONT.default,
      status: "succeeded",
    });
    store.addEdge(node.id, textId);
    store.setSelection([textId]);
    toast.success("已提取原提示词");
    return;
  }

  if (!modelId) {
    toast.message("请先选择语言模型");
    return;
  }

  const projectId = store.projectId;
  if (!projectId) {
    toast.error("画布未就绪");
    return;
  }

  const textId = store.addNode("text", {
    x: node.x + width + gap,
    y: node.y,
  });
  store.updateNode(textId, { ...CANVAS_NODE_SIZE.text });
  store.updateNodeData(textId, {
    text: IMAGE_PROMPT_REVERSE_PRESET,
    title: "反推提示词",
    fontSize: CANVAS_TEXT_FONT.default,
    status: "succeeded",
  });

  const resultId = store.addNode("text", {
    x: node.x + width + gap + CANVAS_NODE_SIZE.text.width + gap,
    y: node.y,
  });
  store.updateNode(resultId, { ...CANVAS_NODE_SIZE.text });
  store.updateNodeData(resultId, {
    text: "",
    title: "反推结果",
    fontSize: CANVAS_TEXT_FONT.default,
    status: "queued",
  });
  store.addEdge(node.id, textId);
  store.addEdge(node.id, resultId);
  store.addEdge(textId, resultId);
  store.setSelection([resultId]);

  const refs = mediaRefFromNode(node);
  const assetId = String(node.data.assetId ?? "").trim();
  try {
    const job = await api<{ id: string }>("/jobs", {
      method: "POST",
      body: {
        kind: "llm",
        input: {
          purpose: "reverse_prompt",
          modelId,
          prompt: IMAGE_PROMPT_REVERSE_PRESET,
          canvasProjectId: projectId,
          canvasNodeId: resultId,
          referenceAssetIds: assetId ? [assetId] : undefined,
          referenceUrls: refs.referenceUrls,
        },
      },
    });
    store.updateNodeData(resultId, { status: "running", jobId: job.id });
    toast.success("已提交反推，结果会写到右侧文本");
  } catch (error) {
    store.updateNodeData(resultId, {
      status: "failed",
      error: error instanceof Error ? error.message : "反推失败",
    });
    toast.error(error instanceof Error ? error.message : "反推失败");
  }
}
