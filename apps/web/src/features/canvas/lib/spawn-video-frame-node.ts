import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "../store";
import {
  captureVideoFrame,
  type VideoFrameAt,
} from "./capture-video-frame";
import { uploadFileToNewNode } from "./upload-to-node";

/** Capture a frame from a video node and place a linked image node beside it. */
export async function spawnVideoFrameNode(
  videoNode: CanvasNode,
  opts: {
    at: VideoFrameAt;
    currentTime?: number;
    title: string;
  },
): Promise<string> {
  const store = useCanvasStore.getState();
  const url = String(videoNode.data.url ?? "");
  if (!url || url.startsWith("data:")) {
    throw new Error("视频尚未就绪");
  }
  store.pushHistory();
  const file = await captureVideoFrame(
    url,
    opts.at,
    opts.currentTime ?? 0,
  );
  const imageId = await uploadFileToNewNode(
    file,
    {
      x: videoNode.x + (videoNode.width ?? 280) + 40,
      y: videoNode.y,
    },
    {
      history: false,
      preferredType: "image",
      title: opts.title,
    },
  );
  store.addEdge(videoNode.id, imageId);
  return imageId;
}
