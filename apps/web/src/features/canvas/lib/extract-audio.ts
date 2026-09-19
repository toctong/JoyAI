import { fetchRemoteVideoBlob } from "./load-canvas-video";

export type SeparatedMedia = {
  audio: File;
  silentVideo: File;
};

function stemFromName(name: string) {
  const base =
    name.trim().split(/[/\\]/).pop()?.split("?")[0]?.split("#")[0] ?? "";
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return stem || "视频";
}

type MediaBunny = typeof import("mediabunny");
type MediaInput = InstanceType<MediaBunny["Input"]>;
type MediaConversion = Awaited<ReturnType<MediaBunny["Conversion"]["init"]>>;

/**
 * Split a video into audio WAV + silent video via mediabunny (demux / WebCodecs).
 * Same approach as infinite-canvas「分离音频」— offline convert, not realtime record.
 */
export async function separateAudioFromVideo(
  url: string,
  sourceName = "视频",
): Promise<SeparatedMedia> {
  const remote = /^https?:/i.test(url);
  const blob = remote
    ? await fetchRemoteVideoBlob(url)
    : await fetch(url).then(async (res) => {
        if (!res.ok) throw new Error("无法加载视频");
        return res.blob();
      });

  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    WavOutputFormat,
    Mp4OutputFormat,
    WebMOutputFormat,
    BufferTarget,
    Conversion,
  } = await import("mediabunny");

  const stem = stemFromName(sourceName);
  const preferWebm =
    blob.type.includes("webm") || /\.webm($|\?)/i.test(url);

  let audioInput: MediaInput | undefined;
  let videoInput: MediaInput | undefined;
  let audioConversion: MediaConversion | undefined;
  let videoConversion: MediaConversion | undefined;

  try {
    audioInput = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const audioTrack = await audioInput.getPrimaryAudioTrack();
    if (!audioTrack) throw new Error("该视频没有音轨");

    const audioTarget = new BufferTarget();
    const audioOutput = new Output({
      format: new WavOutputFormat(),
      target: audioTarget,
    });
    audioConversion = await Conversion.init({
      input: audioInput,
      output: audioOutput,
      tracks: "primary",
      video: { discard: true },
      audio: {
        process: (sample) => {
          if (sample.timestamp < 0 && sample.timestamp > -1e-9) {
            sample.setTimestamp(0);
          }
          return sample;
        },
      },
    });
    if (!audioConversion.isValid) {
      throw new Error("当前浏览器无法解码该文件的音频");
    }
    await audioConversion.execute();
    if (!audioTarget.buffer?.byteLength) {
      throw new Error("分离音频结果为空");
    }
    const audio = new File([audioTarget.buffer], `${stem}_音频.wav`, {
      type: "audio/wav",
    });

    videoInput = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const videoTrack = await videoInput.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("该文件没有视频轨");

    const videoTarget = new BufferTarget();
    const videoOutput = new Output({
      format: preferWebm ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target: videoTarget,
    });
    videoConversion = await Conversion.init({
      input: videoInput,
      output: videoOutput,
      tracks: "primary",
      audio: { discard: true },
    });
    if (!videoConversion.isValid) {
      throw new Error("当前浏览器无法导出无声视频");
    }
    await videoConversion.execute();
    if (!videoTarget.buffer?.byteLength) {
      throw new Error("无声视频结果为空");
    }
    const silentExt = preferWebm ? "webm" : "mp4";
    const silentType = preferWebm ? "video/webm" : "video/mp4";
    const silentVideo = new File(
      [videoTarget.buffer],
      `${stem}_无声.${silentExt}`,
      { type: silentType },
    );

    return { audio, silentVideo };
  } finally {
    await audioConversion?.cancel?.().catch(() => undefined);
    await videoConversion?.cancel?.().catch(() => undefined);
    audioInput?.dispose?.();
    videoInput?.dispose?.();
  }
}

/** @deprecated Prefer separateAudioFromVideo */
export async function extractAudioFromVideo(url: string): Promise<File> {
  const { audio } = await separateAudioFromVideo(url);
  return audio;
}
