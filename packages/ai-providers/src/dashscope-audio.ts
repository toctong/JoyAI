import axios from "axios";
import { AdapterId, ProviderPlatform } from "@joyai/shared";
import type {
  AudioGenerateInput,
  AudioGenerateResult,
  AudioProvider,
} from "./types";
import { formatProviderErrorBody } from "./http-error";
import { resolveDashscopeApiBase } from "./dashscope-video";
import { decodeBase64ToBytes } from "./bytes";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function mimeForFormat(format: string): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "pcm":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
}

function mapFormat(
  format?: AudioGenerateInput["format"],
): "mp3" | "wav" | "opus" | "pcm" {
  if (format === "wav" || format === "opus" || format === "pcm") return format;
  return "mp3";
}

function clampRate(speed?: number): number | undefined {
  if (speed == null || !Number.isFinite(speed)) return undefined;
  return Math.min(2, Math.max(0.5, speed));
}

/**
 * 阿里云百炼 CosyVoice / Qwen-Audio-TTS 非实时 HTTP。
 * POST {apiBase}/services/audio/tts/SpeechSynthesizer → output.audio.url
 * @see https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api
 */
export class DashscopeAudioProvider implements AudioProvider {
  readonly adapterId = AdapterId.DASHSCOPE_AUDIO;
  readonly platform = ProviderPlatform.DASHSCOPE;

  async generate(input: AudioGenerateInput): Promise<AudioGenerateResult> {
    const apiBase = resolveDashscopeApiBase(input.baseUrl, input.metadata);
    const url = `${apiBase}/services/audio/tts/SpeechSynthesizer`;
    const format = mapFormat(input.format);
    const voice = (input.voice ?? "longanyang").trim() || "longanyang";
    const rate = clampRate(input.speed);

    // 新版文档：voice/format 在 input；部分工作空间仍认 parameters 方言
    const parameters: Record<string, unknown> = {
      voice,
      format,
      sample_rate: 22050,
    };
    if (rate != null) parameters.rate = rate;
    const instruction = input.instructions?.trim();
    if (instruction) parameters.instruction = instruction;

    const bodies: Record<string, unknown>[] = [
      {
        model: input.model,
        input: {
          text: input.prompt,
          voice,
          format,
          sample_rate: 22050,
          ...(rate != null ? { rate } : {}),
          ...(instruction ? { instruction } : {}),
        },
      },
      {
        model: input.model,
        input: { text: input.prompt },
        parameters,
      },
    ];

    try {
      type DashAudioResp = {
        code?: string | number;
        message?: string;
        output?: {
          audio?: { url?: string; data?: string };
          finish_reason?: string;
        };
      };

      let lastDetail = "";
      let lastStatus = 0;
      let data: DashAudioResp | null = null;

      for (const body of bodies) {
        const response = await axios.post(url, body, {
          headers: authHeaders(input.apiKey),
          timeout: 180_000,
          validateStatus: () => true,
        });
        lastStatus = response.status;
        const payload = response.data as DashAudioResp;
        const errCode = payload?.code;
        const businessFail =
          response.status >= 400 ||
          (errCode != null &&
            String(errCode) !== "" &&
            String(errCode) !== "0" &&
            String(errCode).toLowerCase() !== "success");
        if (businessFail) {
          lastDetail =
            formatProviderErrorBody(payload) ||
            payload?.message ||
            `HTTP ${response.status}`;
          continue;
        }
        data = payload;
        break;
      }

      if (!data) {
        throw new Error(
          lastDetail
            ? `百炼 TTS 失败: ${lastDetail}`
            : `百炼 TTS 失败 (${lastStatus || "unknown"})`,
        );
      }

      const audioUrl = data.output?.audio?.url?.trim();
      const b64 = data.output?.audio?.data?.trim();

      let bytes: Uint8Array;
      if (audioUrl) {
        const file = await axios.get(audioUrl, {
          responseType: "arraybuffer",
          timeout: 120_000,
          validateStatus: () => true,
        });
        if (file.status >= 400 || !file.data) {
          throw new Error(`百炼 TTS 音频下载失败 (${file.status})`);
        }
        bytes = new Uint8Array(file.data as ArrayBuffer);
      } else if (b64) {
        bytes = decodeBase64ToBytes(b64);
      } else {
        throw new Error("百炼 TTS 未返回音频 url / data");
      }

      if (!bytes.byteLength) throw new Error("百炼 TTS 返回空音频");

      return {
        audio: {
          bytes,
          mimeType: mimeForFormat(format),
          format,
        },
        raw: data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = formatProviderErrorBody(error.response?.data);
        throw new Error(
          detail
            ? `百炼 TTS 失败: ${detail}`
            : `百炼 TTS 失败: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
