import type { CanvasNodeType } from "@joyai/shared";
import { apiUpload } from "@/shared/lib/api";
import { useCanvasStore } from "../store";
import { nodeTypeForUpload } from "./upload-node-type";
import { frameNodeToMedia } from "./fit-node-size";
import { mediaNamePatch } from "./node-title";
import {
  flagPanoramaAspect,
  PANORAMA_NODE_SIZE,
} from "./panorama-prompt";

function guessKind(file: File) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "image";
}

type UploadOpts = {
  /** When false, caller already pushed history. Default true. */
  history?: boolean;
  title?: string;
  /** Skip MIME/aspect probe when the caller already knows the type. */
  preferredType?: CanvasNodeType;
};

/**
 * Spawn a media node in `running` / 上传中… immediately, then fill after upload.
 * Used by create-rail, drag-drop, paste, and other “new node from file” paths.
 */
export async function uploadFileToNewNode(
  file: File,
  at?: { x: number; y: number },
  opts?: UploadOpts,
): Promise<string> {
  const store = useCanvasStore.getState();
  if (opts?.history !== false) store.pushHistory();

  const type =
    opts?.preferredType ?? (await nodeTypeForUpload(file, guessKind(file)));
  const id = store.addNode(type, at);
  if (type === "panorama") {
    store.updateNode(id, {
      width: PANORAMA_NODE_SIZE.width,
      height: PANORAMA_NODE_SIZE.height,
    });
  }
  store.updateNodeData(id, {
    status: "running",
    error: "",
    busyLabel: "上传中…",
    ...mediaNamePatch(file.name),
    ...(opts?.title ? { title: opts.title, titleManual: true } : {}),
  });

  try {
    const asset = await apiUpload<{ id: string; url: string; kind: string }>(
      "/upload",
      file,
    );
    store.updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
      error: "",
      busyLabel: "",
      ...mediaNamePatch(file.name),
      ...(type === "panorama" ? { projection: "equirectangular" } : {}),
      ...(opts?.title ? { title: opts.title, titleManual: true } : {}),
    });
    if (type === "panorama") {
      flagPanoramaAspect(asset.url, (aspectHint) =>
        useCanvasStore.getState().updateNodeData(id, { aspectHint }),
      );
    } else if (type === "image" || type === "video") {
      void frameNodeToMedia(id, file, type);
    }
    return id;
  } catch (error) {
    store.updateNodeData(id, {
      status: "failed",
      error: error instanceof Error ? error.message : "上传失败",
      busyLabel: "",
    });
    throw error;
  }
}

/** Fill an existing empty / replace target while showing 上传中…. */
export async function uploadFileIntoNode(
  nodeId: string,
  file: File,
  opts?: { history?: boolean },
): Promise<void> {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("节点不存在");
  if (
    node.type !== "image" &&
    node.type !== "video" &&
    node.type !== "panorama" &&
    node.type !== "audio"
  ) {
    throw new Error("该节点不支持上传媒体");
  }

  if (opts?.history !== false) store.pushHistory();
  store.updateNodeData(nodeId, {
    status: "running",
    error: "",
    busyLabel: "上传中…",
  });

  try {
    const asset = await apiUpload<{ id: string; url: string; kind: string }>(
      "/upload",
      file,
    );
    store.updateNodeData(nodeId, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
      error: "",
      busyLabel: "",
      ...mediaNamePatch(file.name),
      ...(node.type === "panorama" ? { projection: "equirectangular" } : {}),
    });
    if (node.type === "panorama") {
      flagPanoramaAspect(asset.url, (aspectHint) =>
        useCanvasStore.getState().updateNodeData(nodeId, { aspectHint }),
      );
    } else if (node.type === "image" || node.type === "video") {
      void frameNodeToMedia(nodeId, file, node.type);
    }
  } catch (error) {
    store.updateNodeData(nodeId, {
      status: "failed",
      error: error instanceof Error ? error.message : "上传失败",
      busyLabel: "",
    });
    throw error;
  }
}
