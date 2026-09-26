import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import type { ImageEditOperation } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { uploadFileToNewNode } from "./upload-to-node";

function nodeBox(node: { x: number; y: number; width?: number; height?: number }) {
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? 240,
    height: node.height ?? 240,
  };
}

/** Upload a composite reference image, spawn a prompt node, and submit an image job. */
export async function spawnMarkedImageEdit(opts: {
  sourceNodeId: string;
  blob: Blob;
  prompt: string;
  operation: ImageEditOperation;
  projectId: string | null | undefined;
  modelId?: string;
  resolution?: string;
  ratio?: string;
  /** Extra style / material refs (in addition to the marked composite). */
  extraReferenceAssetIds?: string[];
  extraReferenceUrls?: string[];
  markedTitle?: string;
  toastLabel?: string;
}) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === opts.sourceNodeId);
  if (!node || node.type !== "image") {
    toast.message("仅图片节点支持此操作");
    return;
  }

  const label = opts.toastLabel ?? "提交中…";
  const toastId = toast.loading(label);
  try {
    const file = new File([opts.blob], `edit-${Date.now()}.png`, {
      type: "image/png",
    });
    store.pushHistory();
    const box = nodeBox(node);
    const markedId = await uploadFileToNewNode(
      file,
      { x: box.x + box.width + 40, y: box.y },
      {
        history: false,
        preferredType: "image",
        title: opts.markedTitle ?? "编辑参考",
      },
    );
    const promptId = store.addNode("prompt", {
      x: box.x + box.width + 40,
      y: box.y + box.height + 36,
    });
    const marked = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === markedId);
    const markedAssetId = String(marked?.data.assetId ?? "");
    const markedUrl = String(marked?.data.url ?? "");
    const referenceAssetIds = [
      ...(markedAssetId ? [markedAssetId] : []),
      ...(opts.extraReferenceAssetIds ?? []).filter(Boolean),
    ];
    const referenceUrls = [
      ...(markedUrl && !markedUrl.startsWith("data:") ? [markedUrl] : []),
      ...(opts.extraReferenceUrls ?? []).filter(
        (u) => Boolean(u) && !u.startsWith("data:"),
      ),
    ];
    if (!referenceUrls.length && !referenceAssetIds.length) {
      throw new Error("参考图上传失败");
    }
    store.updateNodeData(promptId, {
      prompt: opts.prompt,
      operation: opts.operation,
      outputKind: "image",
      status: "queued",
      error: "",
      referenceIds: referenceAssetIds,
      referenceUrls,
      ...(opts.modelId ? { genModelId: opts.modelId } : {}),
      ...(opts.resolution ? { genResolution: opts.resolution } : {}),
      ...(opts.ratio ? { genRatio: opts.ratio } : {}),
    });
    store.addEdge(node.id, markedId);
    store.addEdge(node.id, promptId);
    store.addEdge(markedId, promptId);
    store.setSelection([promptId]);

    const job = await api<{ id: string }>("/jobs", {
      method: "POST",
      body: {
        kind: "image",
        input: {
          prompt: opts.prompt,
          n: 1,
          canvasProjectId: opts.projectId || undefined,
          canvasNodeId: promptId,
          referenceAssetIds,
          referenceUrls,
          operation: opts.operation,
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
          ...(opts.resolution ? { resolution: opts.resolution } : {}),
          ...(opts.ratio ? { ratio: opts.ratio } : {}),
        },
      },
    });
    store.updateNodeData(promptId, { status: "running", jobId: job.id });
    toast.success("已提交生成", { id: toastId });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "提交失败", {
      id: toastId,
    });
    throw error;
  }
}
