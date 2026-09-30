import axios from "axios";
import { AdapterId, ProviderPlatform } from "@joyai/shared";
import type {
  AudioGenerateInput,
  AudioGenerateResult,
  AudioProvider,
} from "./types";
import { formatProviderErrorBody } from "./http-error";
import { concatUint8, decodeBase64ToBytes } from "./bytes";

const DEFAULT_OPENSPEECH =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

const DEFAULT_SPEAKER = "zh_female_shuangkuaisisi_uranus_bigtts";

function mimeForFormat(format: string): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
    case "ogg_opus":
      return "audio/ogg";
    case "pcm":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
}

function mapFormat(
  format?: AudioGenerateInput["format"],
): { api: string; out: string } {
  if (format === "wav") return { api: "wav", out: "wav" };
  if (format === "pcm") return { api: "pcm", out: "pcm" };
  if (format === "opus") return { api: "ogg_opus", out: "opus" };
  return { api: "mp3", out: "mp3" };
}

/** OpenAI speed 0.25–4 → 豆包 speech_rate -50…100（0=1x） */
function mapSpeechRate(speed?: number): number {
  if (speed == null || !Number.isFinite(speed)) return 0;
  const rate = Math.round((speed - 1) * 100);
  return Math.min(100, Math.max(-50, rate));
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function resolveResourceId(model: string): string {
  const id = model.trim();
  if (/^seed-(tts|icl)-/i.test(id)) return id;
  if (/tts-?2/i.test(id)) return "seed-tts-2.0";
  if (/tts-?1/i.test(id)) return "seed-tts-1.0";
  return id || "seed-tts-2.0";
}

function requestId(): string {
  return `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildAuthHeaders(
  apiKey: string,
  metadata: Record<string, unknown> | null | undefined,
  resourceId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": requestId(),
  };

  const appId =
    metaString(metadata, "openspeechAppId") ??
    metaString(metadata, "volcSpeechAppId");
  const accessKey =
    metaString(metadata, "openspeechAccessKey") ??
    metaString(metadata, "volcSpeechAccessKey");
  const speechKey =
    metaString(metadata, "openspeechApiKey") ??
    metaString(metadata, "volcSpeechApiKey");

  if (appId && accessKey) {
    headers["X-Api-App-Id"] = appId;
    headers["X-Api-Access-Key"] = accessKey;
    return headers;
  }

  headers["X-Api-Key"] = speechKey || apiKey;
  return headers;
}

function parseNdjsonChunks(raw: string): unknown[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: unknown[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * 火山豆包语音 HTTP Chunked 单向流式。
 * POST openspeech …/api/v3/tts/unidirectional
 * @see https://www.volcengine.com/docs/6561/1598757
 *
 * 鉴权：优先渠道 metadata.openspeechApiKey；否则 channel.apiKey 作 X-Api-Key。
 * 旧控制台可用 metadata.openspeechAppId + openspeechAccessKey。
 * remoteId 映射为 X-Api-Resource-Id（如 seed-tts-2.0）。
 */
export class VolcengineAudioProvider implements AudioProvider {
  readonly adapterId = AdapterId.VOLCENGINE_AUDIO;
  readonly platform = ProviderPlatform.VOLCENGINE;

  async generate(input: AudioGenerateInput): Promise<AudioGenerateResult> {
    const endpoint =
      metaString(input.metadata, "openspeechBaseUrl") ??
      metaString(input.metadata, "volcSpeechBaseUrl") ??
      DEFAULT_OPENSPEECH;
    const resourceId = resolveResourceId(input.model);
    const { api: apiFormat, out: outFormat } = mapFormat(input.format);
    const speaker = (input.voice ?? "").trim() || DEFAULT_SPEAKER;

    const additions: Record<string, unknown> = {};
    const instruction = input.instructions?.trim();
    if (instruction) {
      additions.context_texts = [instruction];
    }

    const body: Record<string, unknown> = {
      user: { uid: "framerally" },
      req_params: {
        text: input.prompt,
        speaker,
        audio_params: {
          format: apiFormat,
          sample_rate: 24000,
          speech_rate: mapSpeechRate(input.speed),
        },
        ...(Object.keys(additions).length
          ? { additions: JSON.stringify(additions) }
          : {}),
      },
    };

    try {
      const response = await axios.post(endpoint, body, {
        headers: buildAuthHeaders(input.apiKey, input.metadata, resourceId),
        responseType: "text",
        timeout: 180_000,
        validateStatus: () => true,
        transitional: { forcedJSONParsing: false },
      });

      const text =
        typeof response.data === "string"
          ? response.data
          : typeof response.data === "object" && response.data != null
            ? JSON.stringify(response.data)
            : String(response.data ?? "");

      if (response.status >= 400) {
        let detail = text.slice(0, 400);
        try {
          detail = formatProviderErrorBody(JSON.parse(text));
        } catch {
          /* keep */
        }
        throw new Error(
          detail
            ? `豆包语音失败: ${detail}`
            : `豆包语音失败 (${response.status})`,
        );
      }

      const chunks = parseNdjsonChunks(text);
      if (!chunks.length) {
        try {
          chunks.push(JSON.parse(text));
        } catch {
          throw new Error("豆包语音返回无法解析");
        }
      }

      const parts: Uint8Array[] = [];
      let lastError = "";

      for (const chunk of chunks) {
        const row = chunk as {
          code?: number;
          message?: string;
          data?: string | null;
        };
        const code = row.code;
        if (code === 20000000) continue;
        if (code != null && code !== 0) {
          lastError = row.message || `code=${code}`;
          continue;
        }
        if (typeof row.data === "string" && row.data.length > 0) {
          parts.push(decodeBase64ToBytes(row.data));
        }
      }

      if (!parts.length) {
        throw new Error(
          lastError ? `豆包语音失败: ${lastError}` : "豆包语音未返回音频数据",
        );
      }

      const bytes = concatUint8(parts);
      return {
        audio: {
          bytes,
          mimeType: mimeForFormat(apiFormat),
          format: outFormat,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = formatProviderErrorBody(error.response?.data);
        throw new Error(
          detail
            ? `豆包语音失败: ${detail}`
            : `豆包语音失败: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
