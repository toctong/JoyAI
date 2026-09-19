import axios from "axios";
import { AdapterId } from "@joyai/shared";
import type { LlmChatInput, LlmChatResult, LlmProvider } from "./types";
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

function readChatText(data: {
  choices?: Array<{
    message?: { content?: unknown };
    text?: unknown;
  }>;
  output_text?: unknown;
}) {
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }
  return typeof data?.output_text === "string" ? data.output_text.trim() : "";
}

/**
 * OpenAI-compatible chat completions — covers APIMart / ToAPIs / Ark OpenAI mode /
 * DashScope compatible-mode / generic openai-compatible gateways.
 */
export class OpenAICompatibleLlmProvider implements LlmProvider {
  readonly adapterId = AdapterId.OPENAI_CHAT;
  readonly platform: string;

  constructor(platform = "openai-compatible") {
    this.platform = platform;
  }

  async chat(input: LlmChatInput): Promise<LlmChatResult> {
    const base = normalizeBase(input.baseUrl);
    const url = `${base}/chat/completions`;
    try {
      const { data } = await axios.post(
        url,
        {
          model: input.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.4,
        },
        {
          headers: authHeaders(input.apiKey),
          timeout: 180_000,
        },
      );

      const text = readChatText(data);
      if (!text) throw new Error("LLM 返回空内容");
      return { text, raw: data };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = formatProviderErrorBody(error.response?.data);
        throw new Error(
          detail
            ? `LLM 请求失败: ${detail}`
            : `LLM 请求失败: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
