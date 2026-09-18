/** Demux audio from a video URL via captureStream + MediaRecorder. */

export async function extractAudioFromVideo(url: string): Promise<File> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("无法加载视频（可能跨域限制）"));
    };
    function cleanup() {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    }
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
  });

  const anyVideo = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const stream = anyVideo.captureStream?.() ?? anyVideo.mozCaptureStream?.();
  if (!stream) {
    throw new Error("当前浏览器不支持从视频抽取音轨");
  }

  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("该视频没有可抽取的音轨");
  }

  const audioStream = new MediaStream(audioTracks);
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  if (!mime) {
    audioTracks.forEach((t) => t.stop());
    throw new Error("浏览器不支持录音编码");
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(audioStream, { mimeType: mime });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("抽音失败"));
  });

  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    audioTracks.forEach((t) => t.stop());
    throw new Error("无法播放视频以抽取音轨");
  }

  recorder.start(200);
  await new Promise<void>((resolve) => {
    if (video.ended) {
      resolve();
      return;
    }
    video.addEventListener("ended", () => resolve(), { once: true });
  });
  if (recorder.state !== "inactive") recorder.stop();
  video.pause();
  audioTracks.forEach((t) => t.stop());
  stream.getTracks().forEach((t) => t.stop());
  video.removeAttribute("src");
  video.load();

  const blob = await stopped;
  if (!blob.size) throw new Error("抽音结果为空");
  return new File([blob], `extract-audio-${Date.now()}.webm`, { type: mime });
}
