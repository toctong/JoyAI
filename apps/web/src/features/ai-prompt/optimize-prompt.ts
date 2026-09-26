import { api } from "@/shared/lib/api";

type PublicModel = {
  id: string;
  kind: string;
  name?: string;
};

type JobDetail = {
  id: string;
  status: string;
  error?: string | null;
  result?: { text?: string | null } | null;
};

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const POLL_MS = 900;
const TIMEOUT_MS = 90_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pickLlmModelId(preferred?: string) {
  const preferredId = preferred?.trim() || "";
  const list = await api<PublicModel[]>("/models");
  const llm = (list ?? []).filter((item) => item.kind === "llm");
  if (!llm.length) return "";
  if (preferredId && llm.some((item) => item.id === preferredId)) {
    return preferredId;
  }
  return llm[0]?.id ?? "";
}

/**
 * Submit a prompt_optimize LLM job and wait for the polished text.
 * Does not touch canvas nodes — callers apply the result into the editor.
 */
export async function optimizePromptText(
  raw: string,
  opts?: { modelId?: string; signal?: AbortSignal },
): Promise<string> {
  const text = raw.trim();
  if (!text) {
    throw new Error("请先输入提示词");
  }

  const modelId = await pickLlmModelId(opts?.modelId);
  if (!modelId) {
    throw new Error("暂无可用文本模型");
  }
  if (opts?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const job = await api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "llm",
      input: {
        purpose: "prompt_optimize",
        toolSlug: "prompt-optimize",
        prompt: text.slice(0, 100_000),
        modelId,
      },
    },
  });

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    if (opts?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    await sleep(POLL_MS);
    if (opts?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const detail = await api<JobDetail>(`/jobs/${job.id}`);
    if (!TERMINAL.has(detail.status)) continue;
    if (detail.status === "succeeded") {
      const out = String(detail.result?.text ?? "").trim();
      if (!out) throw new Error("优化结果为空");
      return out;
    }
    throw new Error(
      String(detail.error ?? "").trim() ||
        (detail.status === "cancelled" ? "已取消优化" : "优化失败"),
    );
  }
  throw new Error("优化超时，请稍后重试");
}
