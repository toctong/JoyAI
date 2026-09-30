"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Plus, Sparkles } from "lucide-react";
import {
  normalizeCanvasAgentChat,
  type CanvasAgentChatMessage,
  type CanvasAgentChatState,
} from "@joyai/shared";
import { api, isApiCancelError } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { waitForJob } from "@/shared/lib/wait-for-job";
import { Textarea } from "@/components/ui/textarea";
import { useManjuStore } from "../manju-store";
import {
  MANJU_AGENT_SYSTEM,
  buildManjuAgentContext,
  describeManjuAction,
  executeManjuAgentActions,
  parseManjuAgentPlan,
} from "./manju-agent";

type Props = {
  projectId: string;
  compactHeader?: boolean;
};

function blankConv() {
  return {
    id: `conv_${crypto.randomUUID().slice(0, 8)}`,
    title: "新对话",
    updatedAt: Date.now(),
    messages: [] as CanvasAgentChatMessage[],
  };
}

export function ManjuAgentPanel({ projectId, compactHeader }: Props) {
  const router = useRouter();
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const loadProject = useManjuStore((s) => s.loadProject);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const [state, setState] = useState<CanvasAgentChatState>(() => {
    const c = blankConv();
    return { activeId: c.id, conversations: [c] };
  });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<number | null>(null);

  const active =
    state.conversations.find((c) => c.id === state.activeId) ??
    state.conversations[0];
  const messages = active?.messages ?? [];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await api<unknown>(
          `/manju/projects/${projectId}/agent-chat`,
        );
        const normalized = normalizeCanvasAgentChat(remote);
        if (!cancelled && normalized) setState(normalized);
      } catch {
        /* empty ok */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const persist = useCallback(
    (next: CanvasAgentChatState) => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        void api(`/manju/projects/${projectId}/agent-chat`, {
          method: "PUT",
          body: next,
          keepalive: true,
        }).catch(() => {
          /* ignore */
        });
      }, 400);
    },
    [projectId],
  );

  const patchActive = useCallback(
    (fn: (msgs: CanvasAgentChatMessage[]) => CanvasAgentChatMessage[]) => {
      setState((prev) => {
        const conversations = prev.conversations.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                updatedAt: Date.now(),
                messages: fn(c.messages).slice(-200),
              }
            : c,
        );
        const next = { ...prev, conversations };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !project || sending) return;
    setDraft("");
    setSending(true);
    const userMsg: CanvasAgentChatMessage = {
      id: `m_${crypto.randomUUID().slice(0, 8)}`,
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    patchActive((msgs) => [...msgs, userMsg]);

    try {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
        .join("\n\n");
      const prompt = [
        MANJU_AGENT_SYSTEM,
        "",
        "当前项目：",
        JSON.stringify(buildManjuAgentContext(project)),
        history ? `\n最近对话：\n${history}` : "",
        `\n用户：${text}`,
      ].join("\n");

      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: "llm",
          input: {
            purpose: "chat",
            prompt,
            manjuProjectId: projectId,
            modelId: project.settings.llmModelId || undefined,
          },
        },
      });

      const detail = await waitForJob(job.id, { timeoutMs: 120_000 });
      const raw = String(detail.result?.text ?? "").trim();
      if (!raw) throw new Error("Agent 响应为空");

      const plan = parseManjuAgentPlan(raw);
      const logs = await executeManjuAgentActions(plan.actions, {
        project,
        routerPush: (href) => router.push(href),
        reloadProject: async () => {
          await loadProject(projectId);
        },
        setAnalyzing: (v) => setAnalyzing(projectId, v),
      });
      const extra = logs.map((l) => `· ${l.ui}`).join("\n");
      const content = [plan.reply, extra].filter(Boolean).join("\n\n");
      patchActive((msgs) => [
        ...msgs,
        {
          id: `m_${crypto.randomUUID().slice(0, 8)}`,
          role: "assistant",
          content,
          createdAt: Date.now(),
        },
      ]);
      if (plan.actions.some((a) => a.name === "run_skill")) {
        toast.message(
          plan.actions.map(describeManjuAction).join("；") || "已执行动作",
        );
      }
    } catch (e) {
      if (isApiCancelError(e)) return;
      const message = e instanceof Error ? e.message : "Agent 失败";
      patchActive((msgs) => [
        ...msgs,
        {
          id: `m_${crypto.randomUUID().slice(0, 8)}`,
          role: "assistant",
          content: message,
          createdAt: Date.now(),
        },
      ]);
      toast.error(message);
    } finally {
      setSending(false);
      setAnalyzing(projectId, false);
    }
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载项目…
      </div>
    );
  }

  return (
    <div className="manju-agent-panel flex h-full min-h-0 flex-col">
      {!compactHeader ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Sparkles className="size-3.5" />
            漫剧 Agent
          </span>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-muted"
            title="新对话"
            onClick={() => {
              const c = blankConv();
              const next = {
                activeId: c.id,
                conversations: [c, ...state.conversations].slice(0, 40),
              };
              setState(next);
              persist(next);
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!hydrated ? (
          <p className="text-xs text-muted-foreground">同步会话…</p>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            可让我分析资产、规划分集、确认脚本，或跳转到角色 / 分镜页。
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-6 bg-primary text-primary-foreground"
                  : "mr-4 bg-muted",
              )}
            >
              {m.content}
            </div>
          ))
        )}
        {sending ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            思考中…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：分析角色并规划第一集分镜"
            rows={3}
            className="pr-12"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="absolute bottom-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
            aria-label="发送"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
