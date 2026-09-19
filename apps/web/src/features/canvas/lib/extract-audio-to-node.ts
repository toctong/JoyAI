import { apiUpload } from "@/shared/lib/api";
import { useCanvasStore } from "../store";
import { separateAudioFromVideo } from "./extract-audio";
import { frameNodeToMedia } from "./fit-node-size";
import { mediaNamePatch, resolveMediaTitle } from "./node-title";

const separating = new Set<string>();

function sourceStem(data: Record<string, unknown>) {
  const title = resolveMediaTitle(data, { fallback: "视频" });
  return title.replace(/\.[^.]+$/, "").trim() || "视频";
}

/** Spawn audio + silent-video nodes immediately, then fill after mediabunny split. */
export async function separateAudioToNode(sourceNodeId: string) {
  if (separating.has(sourceNodeId)) return;
  const source = useCanvasStore
    .getState()
    .nodes.find((item) => item.id === sourceNodeId);
  if (!source || source.type !== "video") {
    throw new Error("仅支持从视频节点分离音频");
  }
  const url = String(source.data.url ?? "");
  if (!url || url.startsWith("data:")) {
    throw new Error("视频地址无效");
  }

  separating.add(sourceNodeId);
  const { pushHistory, addNode, updateNodeData, addEdge, updateNode } =
    useCanvasStore.getState();
  pushHistory();

  const stem = sourceStem(source.data);
  const gap = 40;
  const srcW = source.width ?? 280;
  const srcH = source.height ?? 160;

  const audioId = addNode("audio", {
    x: source.x + srcW + gap,
    y: source.y,
  });
  updateNodeData(audioId, {
    status: "running",
    error: "",
    busyLabel: "分离中…",
    title: `${stem}_音频`,
    titleManual: true,
    fileName: `${stem}_音频.wav`,
  });
  addEdge(source.id, audioId);

  const silentId = addNode("video", {
    x: source.x + srcW + gap,
    y: source.y + Math.max(srcH, 120) + gap,
  });
  updateNode(silentId, {
    width: srcW,
    height: srcH,
  });
  updateNodeData(silentId, {
    status: "running",
    error: "",
    busyLabel: "分离中…",
    title: `${stem}_无声`,
    titleManual: true,
    fileName: `${stem}_无声.mp4`,
  });
  addEdge(source.id, silentId);

  try {
    const { audio, silentVideo } = await separateAudioFromVideo(
      url,
      `${stem}.mp4`,
    );

    const [audioAsset, videoAsset] = await Promise.all([
      apiUpload<{ id: string; url: string }>("/upload", audio),
      apiUpload<{ id: string; url: string }>("/upload", silentVideo),
    ]);

    updateNodeData(audioId, {
      url: audioAsset.url,
      assetId: audioAsset.id,
      status: "succeeded",
      error: "",
      busyLabel: "",
      ...mediaNamePatch(audio.name),
      title: `${stem}_音频`,
      titleManual: true,
    });

    updateNodeData(silentId, {
      url: videoAsset.url,
      assetId: videoAsset.id,
      status: "succeeded",
      error: "",
      busyLabel: "",
      ...mediaNamePatch(silentVideo.name),
      title: `${stem}_无声`,
      titleManual: true,
    });
    await frameNodeToMedia(silentId, silentVideo, "video");
    return { audioId, silentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "分离音频失败";
    const nodes = useCanvasStore.getState().nodes;
    if (nodes.some((item) => item.id === audioId)) {
      updateNodeData(audioId, {
        status: "failed",
        error: message,
        busyLabel: "",
      });
    }
    if (nodes.some((item) => item.id === silentId)) {
      updateNodeData(silentId, {
        status: "failed",
        error: message,
        busyLabel: "",
      });
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    separating.delete(sourceNodeId);
  }
}

/** @deprecated Use separateAudioToNode */
export const extractAudioToNode = separateAudioToNode;
