import { BadRequestException } from "@nestjs/common";
import axios from "axios";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 40 * 1024 * 1024;

/** Pull a public image server-side so the browser can read pixels (TOS often has no CORS). */
export async function fetchPublicImage(rawUrl: string) {
  const url = await assertPublicUrl(rawUrl);
  let response;
  try {
    response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 25_000,
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 300,
      beforeRedirect: (options) => {
        const host = String(options.hostname ?? "");
        if (isBlockedHost(host) || (isIP(host) && isPrivateIp(host))) {
          throw new BadRequestException("不允许的图片地址");
        }
      },
    });
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("无法下载图片");
  }

  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > MAX_BYTES) {
    throw new BadRequestException("图片过大或为空");
  }
  const contentType = sniffImage(buffer);
  if (!contentType) throw new BadRequestException("不是可读取的图片");
  return { buffer, contentType };
}

async function assertPublicUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException("无效图片地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestException("仅支持 http(s) 图片");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHost(host)) throw new BadRequestException("不允许的图片地址");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BadRequestException("不允许的图片地址");
    return parsed.toString();
  }
  let records: { address: string }[] = [];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException("无法解析图片地址");
  }
  if (!records.length || records.some((item) => isPrivateIp(item.address))) {
    throw new BadRequestException("不允许的图片地址");
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
  if (ip === "::1" || ip === "0.0.0.0" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
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

function sniffImage(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
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
