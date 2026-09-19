import { apiFetchBlob, toApiError } from "@/shared/lib/api";

/** Load pixels for canvas ops. Remote URLs go through the API so TOS CORS cannot taint the canvas. */
export async function loadCanvasImage(src: string) {
  const remote = /^https?:/i.test(src);
  const objectUrl = remote
    ? URL.createObjectURL(await fetchRemoteImageBlob(src))
    : "";
  const url = remote ? objectUrl : src;
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("无法读取图片（可能被跨域限制）"));
      image.src = url;
    });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function fetchRemoteImageBlob(src: string) {
  try {
    const blob = await apiFetchBlob("/media/fetch", {
      params: { url: src, kind: "image" },
      timeoutMs: 60_000,
    });
    if (blob.type && !blob.type.startsWith("image/")) {
      throw new Error("无法读取图片（可能被跨域限制）");
    }
    return blob;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("无法读取图片")) {
      throw error;
    }
    const apiError = toApiError(error);
    throw new Error(apiError.message || "无法读取图片（可能被跨域限制）");
  }
}
