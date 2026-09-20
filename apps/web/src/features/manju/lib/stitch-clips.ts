import { fetchRemoteVideoBlob } from "@/features/canvas/lib/load-canvas-video";

export type StitchProgress = {
  clipIndex: number;
  clipTotal: number;
  phase: "fetch" | "encode";
};

async function loadClipBlob(url: string, index: number): Promise<Blob> {
  const remote = /^https?:/i.test(url);
  if (remote) return fetchRemoteVideoBlob(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`镜头 ${index + 1} 下载失败`);
  return res.blob();
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

/**
 * 浏览器内顺序拼接镜头 → 单条 MP4。
 * 以第一镜分辨率为准 letterbox 缩放，避免混分辨率编码失败。
 */
export async function stitchManjuClips(
  urls: string[],
  options?: {
    onProgress?: (p: StitchProgress) => void;
  },
): Promise<Blob> {
  if (urls.length === 0) throw new Error("没有可拼接的镜头");

  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    VideoSample,
    VideoSampleSource,
    VideoSampleSink,
    AudioSampleSource,
    AudioSampleSink,
    Quality,
  } = await import("mediabunny");

  const blobs: Blob[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    options?.onProgress?.({
      clipIndex: i + 1,
      clipTotal: urls.length,
      phase: "fetch",
    });
    blobs.push(await loadClipBlob(urls[i]!, i));
  }

  let anyAudio = false;
  let targetW = 0;
  let targetH = 0;
  for (let i = 0; i < blobs.length; i += 1) {
    const probe = new Input({
      source: new BlobSource(blobs[i]!),
      formats: ALL_FORMATS,
    });
    try {
      const v = await probe.getPrimaryVideoTrack();
      if (!v) throw new Error(`镜头 ${i + 1} 没有视频轨`);
      if (i === 0) {
        targetW = even(v.displayWidth || v.codedWidth);
        targetH = even(v.displayHeight || v.codedHeight);
      }
      if (await probe.getPrimaryAudioTrack()) anyAudio = true;
    } finally {
      probe.dispose?.();
    }
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const videoSource = new VideoSampleSource({
    codec: "avc",
    quality: new Quality("high"),
  });
  output.addVideoTrack(videoSource);

  const audioSource = anyAudio
    ? new AudioSampleSource({
        codec: "aac",
        quality: new Quality("high"),
      })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();

  let videoOffset = 0;
  let audioOffset = 0;
  const inputs: Array<InstanceType<typeof Input>> = [];
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建离屏画布");

  try {
    for (let i = 0; i < blobs.length; i += 1) {
      options?.onProgress?.({
        clipIndex: i + 1,
        clipTotal: urls.length,
        phase: "encode",
      });

      const input = new Input({
        source: new BlobSource(blobs[i]!),
        formats: ALL_FORMATS,
      });
      inputs.push(input);

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error(`镜头 ${i + 1} 没有视频轨`);

      const srcW = videoTrack.displayWidth || videoTrack.codedWidth;
      const srcH = videoTrack.displayHeight || videoTrack.codedHeight;
      const needScale = srcW !== targetW || srcH !== targetH;

      const videoSink = new VideoSampleSink(videoTrack);
      let clipVideoEnd = videoOffset;
      let firstFrame = true;
      for await (const sample of videoSink.samples()) {
        const ts = sample.timestamp + videoOffset;
        const dur = sample.duration || 0;
        clipVideoEnd = Math.max(clipVideoEnd, ts + dur);

        if (needScale) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, targetW, targetH);
          const scale = Math.min(targetW / srcW, targetH / srcH);
          const dw = Math.max(1, Math.round(srcW * scale));
          const dh = Math.max(1, Math.round(srcH * scale));
          const dx = Math.floor((targetW - dw) / 2);
          const dy = Math.floor((targetH - dh) / 2);
          sample.draw(ctx, dx, dy, dw, dh);
          const resized = new VideoSample(canvas, {
            timestamp: ts,
            duration: dur,
          });
          await videoSource.add(
            resized,
            firstFrame ? { keyFrame: true } : undefined,
          );
          resized.close();
          sample.close();
        } else {
          sample.setTimestamp(ts);
          await videoSource.add(
            sample,
            firstFrame ? { keyFrame: true } : undefined,
          );
          sample.close();
        }
        firstFrame = false;
      }
      videoOffset = Math.max(videoOffset, clipVideoEnd);

      if (audioSource) {
        const audioTrack = await input.getPrimaryAudioTrack();
        if (audioTrack) {
          const audioSink = new AudioSampleSink(audioTrack);
          let clipAudioEnd = audioOffset;
          for await (const sample of audioSink.samples()) {
            const ts = sample.timestamp + audioOffset;
            const dur = sample.duration || 0;
            sample.setTimestamp(ts);
            clipAudioEnd = Math.max(clipAudioEnd, ts + dur);
            await audioSource.add(sample);
            sample.close();
          }
          audioOffset = Math.max(audioOffset, clipAudioEnd, videoOffset);
        } else {
          audioOffset = Math.max(audioOffset, videoOffset);
        }
      }
    }

    videoSource.close();
    audioSource?.close();
    await output.finalize();
  } finally {
    for (const input of inputs) input.dispose?.();
  }

  if (!target.buffer?.byteLength) {
    throw new Error("成片结果为空");
  }

  return new Blob([target.buffer], { type: "video/mp4" });
}
