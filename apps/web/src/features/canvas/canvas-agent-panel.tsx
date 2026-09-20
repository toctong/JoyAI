"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCanvasStore } from "./store";
import {
  buildAgentUserPrompt,
  CANVAS_AGENT_SYSTEM,
  executeAgentActions,
  parseAgentPlan,
} from "./lib/canvas-agent";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  projectId: string;
};

/**
 * Minimal canvas Agent: LLM JSON plan → client tool execution.
 * Reuses kind:llm jobs (no Codex / MCP / Skills).
 */
export function CanvasAgentPanel({ projectId }: Props) {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "可以说「在选中图右侧生成 2 张雨夜街景」或「新建提示词节点并连到当前图」。",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingJobRef = useRef<string | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const socket = getJobsSocket();
    const onCompleted = (payload: {
      jobId: string;
      result?: { text?: string };
    }) => {
      if (pendingJobRef.current !== payload.jobId) return;
      pendingJobRef.current = null;
      resolveRef.current?.(String(payload.result?.text ?? ""));
      resolveRef.current = null;
    };
    const onFailed = (payload: { jobId: string; error?: string }) => {
      if (pendingJobRef.current !== payload.jobId) return;
      pendingJobRef.current = null;
      resolveRef.current?.(
        JSON.stringify({
          reply: payload.error ?? "Agent 任务失败",
          actions: [],
        }),
      );
      resolveRef.current = null;
    };
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);
    return () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
    };
  }, []);

  async function runAgentTurn(userText: string) {
    const text = userText.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", content: text },
    ]);

    try {
      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: "llm",
          input: {
            purpose: "chat",
            systemPrompt: CANVAS_AGENT_SYSTEM,
            prompt: buildAgentUserPrompt(text),
            canvasProjectId: projectId,
            temperature: 0.3,
          },
        },
      });

      const replyText = await new Promise<string>((resolve, reject) => {
        pendingJobRef.current = job.id;
        resolveRef.current = resolve;
        window.setTimeout(() => {
          if (pendingJobRef.current === job.id) {
            pendingJobRef.current = null;
            resolveRef.current = null;
            reject(new Error("Agent 响应超时"));
          }
        }, 120_000);
      });

      const plan = parseAgentPlan(replyText);
      const logs = await executeAgentActions(plan.actions);
      const detail = logs.length
        ? `\n\n操作：\n- ${logs.join("\n- ")}`
        : "";
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: `${plan.reply}${detail}`,
        },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Agent 失败";
      toast.error(message);
      setMessages((prev) => [
        ...prev,
        { id: `e_${Date.now()}`, role: "assistant", content: message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Sparkles className="size-3.5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">画布 Agent</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {selectedIds.length
              ? `已选 ${selectedIds.length} 个节点`
              : "未选中节点"}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "ml-6 bg-primary text-primary-foreground"
                  : msg.role === "system"
                    ? "bg-muted/60 text-muted-foreground"
                    : "mr-4 border border-border bg-card",
              )}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              思考并规划操作…
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runAgentTurn(draft);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="描述你想在画布上做的事…"
            data-canvas-shortcuts-ignore
            className="min-h-[52px] flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void runAgentTurn(draft);
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition disabled:opacity-40",
            )}
            aria-label="发送"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
