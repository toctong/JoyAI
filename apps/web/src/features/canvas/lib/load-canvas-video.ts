import axios from "axios";
import { http, toApiError } from "@/shared/lib/api";

/** Same-origin blob for remote video so decode / captureStream work without TOS CORS. */
export async function fetchRemoteVideoBlob(src: string) {
  try {
    const res = await http.get<Blob>("/media/fetch", {
      params: { url: src, kind: "video" },
      responseType: "blob",
      timeout: 180_000,
    });
    const blob = res.data;
    if (blob.type?.includes("json")) {
      throw new Error(await messageFromJsonBlob(blob));
    }
    if (
      blob.type &&
      !blob.type.startsWith("video/") &&
      blob.type !== "application/octet-stream"
    ) {
      throw new Error("无法加载视频（可能跨域限制）");
    }
    return blob;
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) {
      throw error;
    }
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      throw new Error(await messageFromJsonBlob(error.response.data));
    }
    const apiError = toApiError(error);
    throw new Error(apiError.message || "无法加载视频（可能跨域限制）");
  }
}

async function messageFromJsonBlob(blob: Blob) {
  const fallback = "无法加载视频（可能跨域限制）";
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (!parsed.message) return fallback;
    return Array.isArray(parsed.message)
      ? parsed.message.join(", ")
      : parsed.message;
  } catch {
    return fallback;
  }
}

/**
 * Load a video element ready for decode / captureStream.
 * Remote URLs always go through `/media/fetch` — TOS has no CORS, so a
 * crossOrigin probe only pollutes the console and then fails.
 */
export async function loadCanvasVideo(src: string): Promise<{
  video: HTMLVideoElement;
  revoke: () => void;
}> {
  const remote = /^https?:/i.test(src);
  let objectUrl = "";
  const revoke = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }
  };

  const tryLoad = (url: string) =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => resolve(video);
      video.onerror = () =>
        reject(new Error("无法加载视频（可能跨域限制）"));
      video.src = url;
      void video.load();
    });

  try {
    if (!remote) {
      return { video: await tryLoad(src), revoke };
    }

    const blob = await fetchRemoteVideoBlob(src);
    objectUrl = URL.createObjectURL(blob);
    return { video: await tryLoad(objectUrl), revoke };
  } catch (error) {
    revoke();
    throw error;
  }
}
