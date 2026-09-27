import { useCanvasStore } from "../store";
import { applyJobAssetsToMatches } from "./apply-job-assets";
import { frameNodeToMedia } from "./fit-node-size";
import { nodeBox } from "./node-box";
import { titleFromPrompt } from "./node-title";
import { flagPanoramaAspect } from "./panorama-prompt";
import { CANVAS_NODE_SIZE, CANVAS_TEXT_FONT } from "@/shared/theme";

export type JobAssetLike = { id?: string; url?: string | null };

export type JobCompletedPayload = {
  jobId?: string;
  id?: string;
  assets?: JobAssetLike[];
  result?: { text?: string };
};

export type JobFailedPayload = {
  jobId?: string;
  id?: string;
  error?: string;
  status?: string;
};

function notePanoramaAspect(nodeId: string, url: string) {
  flagPanoramaAspect(url, (aspectHint) => {
    useCanvasStore.getState().updateNodeData(nodeId, { aspectHint });
  });
}

export function normalizeJobAssets(
  assets?: JobAssetLike[] | null,
): { id: string; url: string }[] {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((item) => {
      const id = String(item?.id ?? "").trim();
      const url = String(item?.url ?? "").trim();
      if (!id || !url) return null;
      return { id, url };
    })
    .filter((item): item is { id: string; url: string } => Boolean(item));
}

export function resolveJobId(payload: {
  jobId?: string;
  id?: string;
}): string | null {
  const id = String(payload.jobId ?? payload.id ?? "").trim();
  return id || null;
}

/** Apply a succeeded job onto matching canvas nodes. Returns true if applied. */
export function handleCanvasJobCompleted(
  payload: JobCompletedPayload,
): boolean {
  const jobId = resolveJobId(payload);
  if (!jobId) return false;

  const llmText = String(payload.result?.text ?? "").trim();
  if (llmText) {
    const matches = useCanvasStore
      .getState()
      .nodes.filter((node) => String(node.data.jobId ?? "") === jobId);
    if (!matches.length) return false;

    useCanvasStore.getState().pushHistory();
    for (const node of matches) {
      if (node.type === "text") {
        useCanvasStore.getState().updateNodeData(node.id, {
          text: llmText,
          status: "succeeded",
          error: "",
        });
        continue;
      }
      if (node.type === "prompt") {
        useCanvasStore
          .getState()
          .updateNodeData(node.id, { status: "succeeded", error: "" });
        const live = useCanvasStore.getState();
        const outgoing = live.edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => live.nodes.find((item) => item.id === edge.target))
          .filter((item) => item?.type === "text");
        const empty = outgoing.find(
          (item) => !String(item?.data.text ?? "").trim(),
        );
        if (empty) {
          live.updateNodeData(empty.id, {
            text: llmText,
            status: "succeeded",
            error: "",
            title: String(empty.data.title ?? "").trim() || "生成文本",
          });
        } else {
          const box = nodeBox(node);
          const textId = live.addNode("text", {
            x: box.x + box.width + 40,
            y: box.y,
          });
          live.updateNode(textId, { ...CANVAS_NODE_SIZE.text });
          live.updateNodeData(textId, {
            text: llmText,
            status: "succeeded",
            title: titleFromPrompt(llmText) || "生成文本",
            fontSize: CANVAS_TEXT_FONT.default,
          });
          live.addEdge(node.id, textId);
        }
      }
    }
    return true;
  }

  const assets = normalizeJobAssets(payload.assets);
  if (!assets.length) return false;

  const matches = useCanvasStore
    .getState()
    .nodes.filter((node) => String(node.data.jobId ?? "") === jobId);
  if (!matches.length) return false;

  const keepSelection = useCanvasStore.getState().selectedIds.slice();
  useCanvasStore.getState().pushHistory();
  const { addedNode } = applyJobAssetsToMatches({
    jobId,
    assets,
    onFrame: (nodeId, url, kind) => {
      void frameNodeToMedia(nodeId, url, kind);
    },
    onPanoramaNote: (nodeId, url) => notePanoramaAspect(nodeId, url),
  });
  if (addedNode) {
    useCanvasStore.getState().setSelection(keepSelection);
  }
  return true;
}

export function handleCanvasJobFailed(payload: JobFailedPayload): boolean {
  const jobId = resolveJobId(payload);
  if (!jobId) return false;

  const cancelled = payload.status === "cancelled";
  const state = useCanvasStore.getState();
  let touched = false;
  for (const node of state.nodes) {
    if (String(node.data.jobId ?? "") !== jobId) continue;
    touched = true;
    if (cancelled) {
      state.updateNodeData(node.id, {
        status: "idle",
        error: "",
        jobId: "",
        busyLabel: "",
      });
    } else {
      state.updateNodeData(node.id, {
        status: "failed",
        error: payload.error ?? "生成失败",
      });
    }
  }
  return touched;
}
