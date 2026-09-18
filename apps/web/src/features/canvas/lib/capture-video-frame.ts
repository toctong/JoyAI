/** Capture a frame from a video URL into a PNG File for Asset upload. */

export type VideoFrameAt = "first" | "last" | "current";

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const onError = () => {
      cleanup();
      reject(new Error("无法加载视频帧"));
    };
    const onReady = () => {
      cleanup();
      resolve(video);
    };
    function cleanup() {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    }
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(
      0,
      Math.min(time, Number.isFinite(video.duration) ? video.duration : time),
    );
    if (Math.abs(video.currentTime - target) < 0.04) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("视频定位失败"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = target;
  });
}

export async function captureVideoFrame(
  url: string,
  at: VideoFrameAt,
  currentTime = 0,
): Promise<File> {
  const video = await loadVideo(url);
  try {
    if (at === "first") await seek(video, 0);
    else if (at === "last") {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      await seek(video, Math.max(0, dur - 0.05));
    } else {
      await seek(video, currentTime);
    }

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("导出帧失败"))),
        "image/png",
      );
    });
    return new File([blob], `frame-${at}-${Date.now()}.png`, {
      type: "image/png",
    });
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
