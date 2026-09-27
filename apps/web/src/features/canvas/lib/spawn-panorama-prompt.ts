import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { useCanvasStore } from "../store";
import { mediaRefFromNode } from "./canvas-media-refs";
import { wrapPanoramaPrompt } from "./panorama-prompt";

const PANORAMA_SEED =
  "基于参考图生成可环视的 720° 等距柱状全景，比例 2:1，左右边缘无缝衔接";

/** Spawn a panorama node beside the image, wire the edge, and submit the job. */
export async function spawnPanoramaPrompt(
  nodeId: string,
  payload?: { note?: string; modelId?: string },
) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node || node.type !== "image") {
    toast.message("仅图像节点支持转720°全景");
    return;
  }
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) {
    toast.message("图片节点为空，无法转720°全景");
    return;
  }
  const projectId = store.projectId;
  if (!projectId) {
    toast.message("画布项目未就绪");
    return;
  }

  const note = String(payload?.note ?? "").trim();
  const userText = note || PANORAMA_SEED;
  const prompt = wrapPanoramaPrompt(userText, { hasReference: true });
  const refs = mediaRefFromNode(node);
  const width = node.width ?? 240;

  store.pushHistory();
  const targetId = store.addNode("panorama", {
    x: node.x + width + 48,
    y: node.y,
  });
  store.updateNodeData(targetId, {
    status: "queued",
    error: "",
    prompt: userText,
    genDraft: userText,
    title: "转720°全景",
    projection: "equirectangular",
    ...(payload?.modelId ? { genModelId: payload.modelId } : {}),
    ...refs,
  });
  store.addEdge(node.id, targetId);
  store.setSelection([targetId]);

  const canvasNodeIds = new Set(store.nodes.map((item) => item.id));
  const referenceAssetIds = [
    ...new Set(
      (refs.referenceIds ?? []).filter((id) => id && !canvasNodeIds.has(id)),
    ),
  ];
  const referenceUrls = (refs.referenceUrls ?? []).filter(
    (item) => item && !item.startsWith("data:") && !item.startsWith("blob:"),
  );

  try {
    const job = await api<{ id: string }>("/jobs", {
      method: "POST",
      body: {
        kind: "image",
        input: {
          prompt,
          n: 1,
          ratio: "2:1",
          modelId: payload?.modelId,
          canvasProjectId: projectId,
          canvasNodeId: targetId,
          referenceAssetIds,
          referenceUrls,
          operation: "generate",
        },
      },
    });
    useCanvasStore.getState().updateNodeData(targetId, {
      status: "running",
      jobId: job.id,
    });
    toast.success("已提交转720°全景任务");
  } catch (error) {
    useCanvasStore.getState().updateNodeData(targetId, {
      status: "failed",
      error: error instanceof Error ? error.message : "提交失败",
    });
    toast.error(error instanceof Error ? error.message : "提交失败");
  }
}
