import { api } from "@/shared/lib/api";
import { waitForJob } from "@/shared/lib/wait-for-job";

type PublicModel = {
  id: string;
  kind: string;
  name?: string;
};

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
 * Completes via Socket.IO push (no interval polling).
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

  try {
    const detail = await waitForJob(job.id, {
      timeoutMs: 90_000,
      signal: opts?.signal,
    });
    const out = String(detail.result?.text ?? "").trim();
    if (!out) throw new Error("优化结果为空");
    return out;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    const msg = e instanceof Error ? e.message : "优化失败";
    if (msg === "已取消") throw new Error("已取消优化");
    throw e instanceof Error ? e : new Error(msg);
  }
}
