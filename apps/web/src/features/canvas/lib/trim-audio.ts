/** Trim a media URL to a new audio file. Prefer decoded WAV; fall back to a capture window. */

const MIN_SECONDS = 0.5;

export async function trimMediaToFile(
  url: string,
  start: number,
  end: number,
): Promise<File> {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end - start < MIN_SECONDS
  ) {
    throw new Error("请选择至少 0.5 秒");
  }

  try {
    return await trimDecodedWav(url, start, end);
  } catch (decoded) {
    try {
      return await trimCaptureWindow(url, start, end);
    } catch (captured) {
      if (captured instanceof Error && /没有音轨|不支持/.test(captured.message)) {
        throw captured;
      }
      if (decoded instanceof Error && /下载|跨域/.test(decoded.message)) {
        throw decoded;
      }
      throw new Error("无法截取这段音频");
    }
  }
}

async function trimDecodedWav(url: string, start: number, end: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("无法下载媒体（可能跨域限制）");
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const rate = decoded.sampleRate;
    const from = Math.max(0, Math.floor(start * rate));
    const to = Math.min(decoded.length, Math.floor(end * rate));
    const length = to - from;
    if (length < Math.floor(rate * MIN_SECONDS)) {
      throw new Error("结束时间超出音频时长");
    }
    const sliced = context.createBuffer(
      decoded.numberOfChannels,
      length,
      rate,
    );
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      sliced.copyToChannel(
        decoded.getChannelData(channel).subarray(from, to),
        channel,
      );
    }
    const blob = encodeWav(sliced);
    return new File([blob], `trim-audio-${Date.now()}.wav`, {
      type: "audio/wav",
    });
  } finally {
    await context.close();
  }
}

async function trimCaptureWindow(url: string, start: number, end: number) {
  const media = document.createElement("video");
  media.crossOrigin = "anonymous";
  media.preload = "auto";
  media.playsInline = true;
  media.src = url;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("无法加载媒体（可能跨域限制）"));
    };
    function cleanup() {
      media.removeEventListener("loadeddata", onReady);
      media.removeEventListener("error", onError);
    }
    media.addEventListener("loadeddata", onReady);
    media.addEventListener("error", onError);
  });

  const anyMedia = media as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const stream = anyMedia.captureStream?.() ?? anyMedia.mozCaptureStream?.();
  if (!stream) throw new Error("当前浏览器不支持截取音轨");

  media.currentTime = start;
  await new Promise<void>((resolve, reject) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      media.removeEventListener("seeked", finish);
      resolve();
    };
    timer = window.setTimeout(() => {
      media.removeEventListener("seeked", finish);
      reject(new Error("定位截取起点超时"));
    }, 4000);
    if (Math.abs(media.currentTime - start) < 0.08) {
      finish();
      return;
    }
    media.addEventListener("seeked", finish);
  });

  try {
    await media.play();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("无法播放以截取音轨");
  }

  const audioTracks = await waitForAudioTracks(stream);
  if (!audioTracks.length) {
    media.pause();
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("该文件没有可截取的音轨");
  }

  const mime = pickAudioMime();
  if (!mime) {
    media.pause();
    audioTracks.forEach((track) => track.stop());
    throw new Error("浏览器不支持录音编码");
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(new MediaStream(audioTracks), {
    mimeType: mime,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("截取失败"));
  });

  recorder.start(100);
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (media.currentTime >= end || media.ended) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  media.pause();
  if (recorder.state !== "inactive") recorder.stop();
  audioTracks.forEach((track) => track.stop());
  stream.getTracks().forEach((track) => track.stop());
  media.removeAttribute("src");
  media.load();

  const blob = await stopped;
  if (!blob.size) throw new Error("截取结果为空");
  return new File([blob], `trim-audio-${Date.now()}.webm`, { type: mime });
}

function pickAudioMime() {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "";
}

function waitForAudioTracks(stream: MediaStream) {
  const ready = () => stream.getAudioTracks();
  if (ready().length) return Promise.resolve(ready());
  return new Promise<MediaStreamTrack[]>((resolve) => {
    const timer = window.setTimeout(() => {
      stream.removeEventListener("addtrack", onAdd);
      resolve(ready());
    }, 1200);
    const onAdd = () => {
      if (!ready().length) return;
      window.clearTimeout(timer);
      stream.removeEventListener("addtrack", onAdd);
      resolve(ready());
    };
    stream.addEventListener("addtrack", onAdd);
  });
}

function encodeWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = samples * blockAlign;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const planes = Array.from({ length: channels }, (_, index) =>
    buffer.getChannelData(index),
  );
  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, planes[channel][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
