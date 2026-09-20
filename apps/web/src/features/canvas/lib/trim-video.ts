import { fetchRemoteVideoBlob } from "./load-canvas-video";

const MIN_SECONDS = 0.5;

function stemFromName(name: string) {
  const base =
    name.trim().split(/[/\\]/).pop()?.split("?")[0]?.split("#")[0] ?? "";
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return stem || "视频";
}

async function loadBlob(url: string, kind: "video" | "audio") {
  if (/^https?:/i.test(url) && kind === "video") {
    return fetchRemoteVideoBlob(url);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("无法加载媒体");
  return res.blob();
}

function assertRange(start: number, end: number) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end - start < MIN_SECONDS
  ) {
    throw new Error("请选择至少 0.5 秒");
  }
}

/** Clip a video into a new mp4/webm (video + audio when present). */
export async function trimVideoToFile(
  url: string,
  start: number,
  end: number,
  sourceName = "视频",
): Promise<File> {
  assertRange(start, end);
  const blob = await loadBlob(url, "video");
  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    BufferTarget,
    Conversion,
  } = await import("mediabunny");

  const preferWebm =
    blob.type.includes("webm") || /\.webm($|\?)/i.test(url);
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({
    format: preferWebm ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target,
  });

  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start, end },
    });
    if (!conversion.isValid) {
      throw new Error("当前浏览器无法剪辑这段视频");
    }
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error("剪辑结果为空");
    const ext = preferWebm ? "webm" : "mp4";
    const type = preferWebm ? "video/webm" : "video/mp4";
    return new File(
      [target.buffer],
      `${stemFromName(sourceName)}-剪辑.${ext}`,
      { type },
    );
  } finally {
    input.dispose?.();
  }
}
