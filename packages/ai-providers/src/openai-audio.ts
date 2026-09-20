import axios from "axios";
import { AdapterId } from "@joyai/shared";
import type { AudioGenerateInput, AudioGenerateResult, AudioProvider } from "./types";
import { formatProviderErrorBody } from "./http-error";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function mimeForFormat(format: string): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
}

function bytesToUtf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

/**
 * OpenAI-compatible `/audio/speech` — APIMart / ToAPIs / generic gateways.
 */
export class OpenAICompatibleAudioProvider implements AudioProvider {
  readonly adapterId = AdapterId.OPENAI_AUDIO;
  readonly platform: string;

  constructor(platform = "openai-compatible") {
    this.platform = platform;
  }

  async generate(input: AudioGenerateInput): Promise<AudioGenerateResult> {
    const base = normalizeBase(input.baseUrl);
    const url = `${base}/audio/speech`;
    const format = input.format ?? "mp3";
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.prompt,
      voice: input.voice ?? "alloy",
      response_format: format,
    };
    if (input.speed != null && Number.isFinite(input.speed)) {
      body.speed = input.speed;
    }
    if (input.instructions?.trim()) {
      body.instructions = input.instructions.trim();
    }

    try {
      const response = await axios.post(url, body, {
        headers: authHeaders(input.apiKey),
        responseType: "arraybuffer",
        timeout: 180_000,
        validateStatus: () => true,
      });

      const contentType = String(
        response.headers["content-type"] ?? "",
      ).toLowerCase();
      const buf = new Uint8Array(response.data as ArrayBuffer);

      if (response.status >= 400 || contentType.includes("json")) {
        let detail = "";
        try {
          detail = formatProviderErrorBody(JSON.parse(bytesToUtf8(buf)));
        } catch {
          detail = bytesToUtf8(buf).slice(0, 400);
        }
        throw new Error(
          detail
            ? `TTS 请求失败: ${detail}`
            : `TTS 请求失败 (${response.status})`,
        );
      }

      if (!buf.byteLength) throw new Error("TTS 返回空音频");

      return {
        audio: {
          bytes: buf,
          mimeType: contentType.startsWith("audio/")
            ? contentType.split(";")[0]!.trim()
            : mimeForFormat(format),
          format,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = formatProviderErrorBody(error.response?.data);
        throw new Error(
          detail ? `TTS 请求失败: ${detail}` : `TTS 请求失败: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
