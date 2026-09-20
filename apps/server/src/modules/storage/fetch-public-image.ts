import { BadRequestException } from "@nestjs/common";
import axios from "axios";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

export type PublicMediaKind = "image" | "video" | "audio";

/** Pull public media server-side so the browser can decode without TOS CORS. */
export async function fetchPublicMedia(
  rawUrl: string,
  prefer: PublicMediaKind | "auto" = "auto",
) {
  const url = await assertPublicUrl(rawUrl);
  const maxBytes =
    prefer === "image"
      ? MAX_IMAGE_BYTES
      : prefer === "audio"
        ? MAX_AUDIO_BYTES
        : MAX_VIDEO_BYTES;
  let response;
  try {
    response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout:
        prefer === "image" ? 120_000 : prefer === "audio" ? 120_000 : 180_000,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects: 3,
      headers: { "Accept-Encoding": "identity" },
      validateStatus: (status) => status >= 200 && status < 300,
      beforeRedirect: (options) => {
        const host = String(options.hostname ?? "");
        if (isBlockedHost(host) || (isIP(host) && isPrivateIp(host))) {
          throw new BadRequestException("不允许的媒体地址");
        }
      },
    });
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("无法下载媒体");
  }

  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > maxBytes) {
    throw new BadRequestException("文件过大或为空");
  }

  const headerType = String(response.headers["content-type"] ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const sniffed = sniffMedia(buffer, headerType);
  if (!sniffed) throw new BadRequestException("不是可读取的媒体文件");
  if (prefer === "image" && sniffed.kind !== "image") {
    throw new BadRequestException("不是可读取的图片");
  }
  if (prefer === "video" && sniffed.kind !== "video") {
    throw new BadRequestException("不是可读取的视频");
  }
  if (prefer === "audio" && sniffed.kind !== "audio") {
    throw new BadRequestException("不是可读取的音频");
  }
  return { buffer, contentType: sniffed.contentType, kind: sniffed.kind };
}

/** Pull a public image server-side so the browser can read pixels. */
export async function fetchPublicImage(rawUrl: string) {
  const media = await fetchPublicMedia(rawUrl, "image");
  return { buffer: media.buffer, contentType: media.contentType };
}

async function assertPublicUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException("无效媒体地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestException("仅支持 http(s) 地址");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHost(host)) throw new BadRequestException("不允许的媒体地址");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BadRequestException("不允许的媒体地址");
    return parsed.toString();
  }
  let records: { address: string }[] = [];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException("无法解析媒体地址");
  }
  if (!records.length || records.some((item) => isPrivateIp(item.address))) {
    throw new BadRequestException("不允许的媒体地址");
  }
  return parsed.toString();
}

function isBlockedHost(host: string) {
  const name = host.trim().toLowerCase();
  if (!name) return true;
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal") ||
    name === "metadata.google.internal"
  ) {
    return true;
  }
  return false;
}

function isPrivateIp(address: string) {
  const ip = address.toLowerCase();
  if (
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  ) {
    return true;
  }
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = v4.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function sniffMedia(buffer: Buffer, headerType?: string) {
  const image = sniffImage(buffer);
  if (image) return { kind: "image" as const, contentType: image };
  const audio = sniffAudio(buffer, headerType);
  if (audio) return { kind: "audio" as const, contentType: audio };
  const video = sniffVideo(buffer, headerType);
  if (video) return { kind: "video" as const, contentType: video };
  if (headerType?.startsWith("image/")) {
    return { kind: "image" as const, contentType: headerType };
  }
  if (headerType?.startsWith("audio/")) {
    return { kind: "audio" as const, contentType: headerType };
  }
  if (headerType?.startsWith("video/")) {
    return { kind: "video" as const, contentType: headerType };
  }
  return null;
}

function sniffImage(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function sniffVideo(buffer: Buffer, headerType?: string) {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return "video/mp4";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "AVI "
  ) {
    return "video/x-msvideo";
  }
  if (headerType?.startsWith("video/")) return headerType;
  return null;
}

function sniffAudio(buffer: Buffer, headerType?: string) {
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") {
    return "audio/mpeg";
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  if (
    buffer.length >= 4 &&
    buffer.toString("ascii", 0, 4) === "OggS"
  ) {
    return "audio/ogg";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3 &&
    headerType?.startsWith("audio/")
  ) {
    return headerType;
  }
  if (headerType?.startsWith("audio/")) return headerType;
  return null;
}
