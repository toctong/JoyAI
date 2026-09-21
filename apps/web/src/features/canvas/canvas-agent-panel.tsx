"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Box,
  ChevronDown,
  History,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanvasStore } from "./store";
import {
  readAgentModePreference,
  readAgentModelIdPreference,
  writeAgentModePreference,
  writeAgentModelIdPreference,
  type CanvasAgentMode,
} from "./lib/canvas-prefs";
import {
  AGENT_MAX_ROUNDS,
  AgentNodeRefs,
  CANVAS_AGENT_SYSTEM,
  buildAgentTurnPrompt,
  describeAgentAction,
  executeAgentActions,
  isGenerateAction,
  parseAgentPlan,
  type AgentExecContext,
  type AgentStepLog,
  type CanvasAgentAction,
} from "./lib/canvas-agent";
import {
  formatChatHistoryForPrompt,
  useCanvasAgentChat,
} from "./lib/use-canvas-agent-chat";
import "@/features/studio/creation-composer.css";
import "./canvas-agent-panel.css";

const STOP = "__JOY_AGENT_STOP__";

type LlmModel = {
  id: string;
  name: string;
  kind: string;
  remoteId?: string;
  channel?: { name?: string };
};

type Session = {
  runId: number;
  userText: string;
  /** Prior turns in this conversation, excluding the current request. */
  chatHistory: string;
  transcript: string[];
  round: number;
  touched: Set<string>;
  historyPushed: boolean;
};

type PendingGen = {
  runId: number;
  actions: CanvasAgentAction[];
};

type Props = {
  projectId: string;
  /** Hide the built-in title row when hosted in the agent drawer. */
  compactHeader?: boolean;
};

function renderTurn(reply: string, logs: AgentStepLog[], extra?: string) {
  const lines = [
    reply.trim(),
    ...logs.map((log) => `· ${log.ui}`),
    extra?.trim() ?? "",
  ].filter(Boolean);
  return lines.join("\n");
}

function transcriptBlock(reply: string, logs: AgentStepLog[]) {
  const tools = logs.map((log) => log.model).join("\n");
  return [`助手：${reply.trim() || "已处理"}`, tools ? `工具结果：\n${tools}` : ""]
    .filter(Boolean)
    .join("\n");
}

function pickLlmModelId(models: LlmModel[], preferred?: string) {
  if (!models.length) return "";
  if (preferred && models.some((item) => item.id === preferred)) {
    return preferred;
  }
  return models[0]!.id;
}

/**
 * Canvas Agent: multi-turn JSON tools on the client.
 * Reuses kind:llm jobs (no Codex / MCP / Skills).
 */
export function CanvasAgentPanel({ projectId, compactHeader = false }: Props) {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const chat = useCanvasAgentChat(projectId);
  const {
    hydrated,
    conversations,
    activeConversation,
    messages,
    historyOpen,
    openHistory,
    closeHistory,
    createNewChat,
    selectConversation,
    deleteConversation,
    appendMessage,
  } = chat;
  const appendRef = useRef(appendMessage);
  appendRef.current = appendMessage;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<CanvasAgentMode>("assist");
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [pending, setPending] = useState<PendingGen | null>(null);
  const pendingJobRef = useRef<string | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const refsRef = useRef(new AgentNodeRefs());
  const sessionRef = useRef<Session | null>(null);
  const runIdRef = useRef(0);
  const modeRef = useRef(mode);
  const modelIdRef = useRef(modelId);
  modeRef.current = mode;
  modelIdRef.current = modelId;

  useEffect(() => {
    setMode(readAgentModePreference());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api<LlmModel[]>("/models")
      .then((list) => {
        if (cancelled) return;
        const llm = list.filter((item) => item.kind === "llm");
        setModels(llm);
        const next = pickLlmModelId(llm, readAgentModelIdPreference());
        setModelId(next);
        if (next) writeAgentModelIdPreference(next);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, pending, status]);

  useEffect(() => {
    const socket = getJobsSocket();
    const onCompleted = (payload: {
      jobId: string;
      result?: { text?: string };
    }) => {
      if (pendingJobRef.current !== payload.jobId) return;
      pendingJobRef.current = null;
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve?.(String(payload.result?.text ?? ""));
    };
    const onFailed = (payload: { jobId: string; error?: string }) => {
      if (pendingJobRef.current !== payload.jobId) return;
      pendingJobRef.current = null;
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve?.(
        JSON.stringify({
          reply: payload.error ?? "Agent 任务失败",
          actions: [],
        }),
      );
    };
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);
    return () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
    };
  }, []);

  function pushMessage(
    role: "user" | "assistant" | "system",
    content: string,
  ) {
    const text = content.trim();
    if (!text) return;
    appendRef.current({ role, content: text });
  }

  function execCtx(): AgentExecContext {
    const session = sessionRef.current;
    if (!session) {
      throw new Error("Agent 会话已结束");
    }
    return {
      refs: refsRef.current,
      touched: session.touched,
      pushHistoryOnce: () => {
        if (session.historyPushed) return;
        session.historyPushed = true;
        useCanvasStore.getState().pushHistory();
      },
      alive: () => runIdRef.current === session.runId,
    };
  }

  function requestLlm(prompt: string, runId: number) {
    return new Promise<string>((resolve, reject) => {
      void (async () => {
        try {
          const job = await api<{ id: string }>("/jobs", {
            method: "POST",
            body: {
              kind: "llm",
              input: {
                purpose: "chat",
                systemPrompt: CANVAS_AGENT_SYSTEM,
                prompt,
                canvasProjectId: projectId,
                modelId: modelIdRef.current || undefined,
                temperature: 0.3,
              },
            },
          });
          if (runIdRef.current !== runId) {
            resolve(STOP);
            return;
          }
          pendingJobRef.current = job.id;
          resolveRef.current = resolve;
          window.setTimeout(() => {
            if (pendingJobRef.current !== job.id) return;
            pendingJobRef.current = null;
            resolveRef.current = null;
            reject(new Error("Agent 响应超时"));
          }, 120_000);
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  async function pump(runId: number): Promise<"paused" | "done"> {
    const session = sessionRef.current;
    if (!session || session.runId !== runId) return "done";
    let unfinished = false;

    while (session.round < AGENT_MAX_ROUNDS) {
      if (runIdRef.current !== runId) return "done";
      setStatus(`规划第 ${session.round + 1} 步…`);
      const raw = await requestLlm(
        buildAgentTurnPrompt({
          refs: refsRef.current,
          userText: session.userText,
          transcript: session.transcript,
          chatHistory: session.chatHistory,
        }),
        runId,
      );
      if (raw === STOP || runIdRef.current !== runId) return "done";

      const plan = parseAgentPlan(raw);
      const safe = plan.actions.filter((action) => !isGenerateAction(action));
      const gens = plan.actions.filter(isGenerateAction);
      setStatus(safe.length ? "执行操作…" : "");
      const safeLogs = safe.length
        ? await executeAgentActions(safe, execCtx())
        : [];
      if (runIdRef.current !== runId) return "done";

      session.transcript.push(transcriptBlock(plan.reply, safeLogs));
      session.round += 1;
      unfinished = plan.actions.length > 0;

      if (gens.length && modeRef.current === "assist") {
        pushMessage(
          "assistant",
          renderTurn(plan.reply, safeLogs, "请确认是否提交生成。"),
        );
        setPending({ runId, actions: gens });
        setStatus("");
        return "paused";
      }

      setStatus(gens.length ? "提交生成…" : "");
      const genLogs = gens.length
        ? await executeAgentActions(gens, execCtx())
        : [];
      if (runIdRef.current !== runId) return "done";
      if (genLogs.length) {
        session.transcript.push(
          `工具结果：\n${genLogs.map((log) => log.model).join("\n")}`,
        );
      }
      pushMessage(
        "assistant",
        renderTurn(plan.reply, [...safeLogs, ...genLogs]),
      );
      if (!unfinished) break;
    }

    if (unfinished && session.round >= AGENT_MAX_ROUNDS) {
      pushMessage("system", "已达到步骤上限，可以说下一步继续。");
    }
    return "done";
  }

  async function runSession(runId: number) {
    setBusy(true);
    try {
      const outcome = await pump(runId);
      if (runIdRef.current !== runId) return;
      if (outcome === "done") {
        setBusy(false);
        setStatus("");
      } else {
        setBusy(false);
      }
    } catch (error) {
      if (runIdRef.current !== runId) return;
      const message = error instanceof Error ? error.message : "Agent 失败";
      toast.error(message);
      pushMessage("assistant", message);
      setBusy(false);
      setStatus("");
      setPending(null);
    }
  }

  function startTurn(userText: string) {
    const text = userText.trim();
    if (!text || busy || pending || !hydrated) return;
    if (!modelIdRef.current && models.length > 0) {
      toast.error("请先选择文本模型");
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    sessionRef.current = {
      runId,
      userText: text,
      chatHistory: formatChatHistoryForPrompt(messages),
      transcript: [],
      round: 0,
      touched: new Set(),
      historyPushed: false,
    };
    setDraft("");
    pushMessage("user", text);
    void runSession(runId);
  }

  function stop() {
    if (!busy && !pending) return;
    runIdRef.current += 1;
    pendingJobRef.current = null;
    resolveRef.current?.(STOP);
    resolveRef.current = null;
    sessionRef.current = null;
    setPending(null);
    setBusy(false);
    setStatus("");
    pushMessage("system", "已停止");
  }

  async function settlePending(approved: boolean) {
    const current = pending;
    const session = sessionRef.current;
    if (!current || !session || current.runId !== runIdRef.current) return;
    setPending(null);
    setBusy(true);
    try {
      if (approved) {
        setStatus("提交生成…");
        const logs = await executeAgentActions(current.actions, execCtx());
        if (current.runId !== runIdRef.current) return;
        session.transcript.push(
          `工具结果：\n${logs.map((log) => log.model).join("\n")}`,
        );
        pushMessage("system", logs.map((log) => log.ui).join("\n"));
      } else {
        const skipped = current.actions.map(describeAgentAction).join("；");
        const note = `用户跳过了生成：${skipped}。不要重复提交，除非用户再次要求。`;
        session.transcript.push(note);
        pushMessage("system", "已跳过生成");
      }
      if (current.runId !== runIdRef.current) return;
      await runSession(current.runId);
    } catch (error) {
      if (current.runId !== runIdRef.current) return;
      const message = error instanceof Error ? error.message : "Agent 失败";
      toast.error(message);
      pushMessage("assistant", message);
      setBusy(false);
      setStatus("");
    }
  }

  function beginFreshChat() {
    if ((activeConversation?.messages.length ?? 0) === 0 && !busy && !pending) {
      closeHistory();
      setDraft("");
      return;
    }
    if (busy || pending) stop();
    createNewChat();
    setDraft("");
  }

  function openSavedChat(id: string) {
    if (id === activeConversation?.id) {
      closeHistory();
      return;
    }
    if (busy || pending) stop();
    selectConversation(id);
    setDraft("");
  }
  function chooseMode(next: CanvasAgentMode) {
    setMode(next);
    writeAgentModePreference(next);
  }

  function chooseModel(next: string) {
    setModelId(next);
    writeAgentModelIdPreference(next);
  }

  const locked = busy || !!pending;
  const selectedModel = models.find((item) => item.id === modelId);
  const modelLabel =
    selectedModel?.name ?? (models.length ? "选择模型" : "暂无模型");

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {historyOpen ? (
        <div className="joy-agent-history">
          <div className="joy-agent-history-head">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <History className="size-4" />
              历史会话
            </span>
            <button
              type="button"
              className="joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg"
              aria-label="关闭历史"
              onClick={closeHistory}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="joy-agent-history-scroll">
            {conversations.some((item) => item.messages.length > 0) ? (
              <ul className="space-y-1">
                {conversations
                  .filter((item) => item.messages.length > 0)
                  .map((item) => (
                  <li key={item.id} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      className={cn(
                        "joy-agent-history-item",
                        item.id === activeConversation?.id && "is-active",
                      )}
                      onClick={() => openSavedChat(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {new Date(item.updatedAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {` · ${item.messages.length} 条`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="joy-agent-history-delete"
                      aria-label="删除会话"
                      onClick={() => {
                        if (
                          (busy || pending) &&
                          item.id === activeConversation?.id
                        ) {
                          stop();
                        }
                        deleteConversation(item.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                还没有历史会话
              </p>
            )}
          </div>
        </div>
      ) : null}

      {compactHeader ? null : (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Sparkles className="size-3.5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {activeConversation?.title ?? "画布 Agent"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {selectedIds.length
                ? `已选 ${selectedIds.length} 个节点`
                : "未选中节点"}
            </div>
          </div>
          <ChatSessionButtons
            historyOpen={historyOpen}
            onNew={beginFreshChat}
            onHistory={historyOpen ? closeHistory : openHistory}
          />
        </div>
      )}
      {compactHeader ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {activeConversation?.title && activeConversation.title !== "新对话"
              ? activeConversation.title
              : selectedIds.length
                ? `已选 ${selectedIds.length} 个节点`
                : "未选中节点"}
          </span>
          <ChatSessionButtons
            historyOpen={historyOpen}
            onNew={beginFreshChat}
            onHistory={historyOpen ? closeHistory : openHistory}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {hydrated && messages.length === 0 ? (
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              可以说「在选中图右侧生成 2 张雨夜街景」或「新建提示词节点并连到当前图」。同一会话会记住上文；新话题请开新对话。
            </div>
          ) : null}
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
              {status || "思考并规划操作…"}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {pending ? (
        <div className="border-t border-border px-3 py-2.5">
          <div className="mb-2 text-[11px] text-muted-foreground">
            确认后才会提交生成
          </div>
          <ul className="mb-2 space-y-1 text-xs leading-relaxed">
            {pending.actions.map((action, index) => (
              <li key={`${action.name}_${index}`}>
                · {describeAgentAction(action)}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              onClick={() => void settlePending(true)}
            >
              确认生成
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-xs"
              onClick={() => void settlePending(false)}
            >
              跳过
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="joy-agent-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || pending) stop();
          else startTurn(draft);
        }}
      >
        <div className="joy-agent-composer-shell">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            disabled={locked}
            placeholder={
              pending ? "请先确认或跳过生成…" : "描述你想在画布上做的事…"
            }
            data-canvas-shortcuts-ignore
            className="joy-agent-composer-input"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!locked) startTurn(draft);
              }
            }}
          />
          <div className="joy-agent-composer-bar">
            <div className="joy-agent-composer-bar-left">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={locked || models.length === 0}
                    className="joy-chip joy-chip-model"
                    data-canvas-shortcuts-ignore
                  >
                    {selectedModel ? (
                      <BrandAvatar
                        src={modelIconSrc({
                          remoteId: selectedModel.remoteId,
                          name: selectedModel.name,
                        })}
                        label={selectedModel.name}
                        size={16}
                        rounded="md"
                      />
                    ) : (
                      <Box className="size-3.5 opacity-80" />
                    )}
                    <span className="joy-chip-model-name">{modelLabel}</span>
                    <ChevronDown className="size-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="joy-composer-model-menu min-w-[240px]"
                  data-canvas-shortcuts-ignore
                >
                  {models.length === 0 ? (
                    <DropdownMenuItem disabled>
                      暂无可用文本模型
                    </DropdownMenuItem>
                  ) : (
                    models.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        className={cn(
                          "joy-composer-model-item",
                          item.id === modelId && "is-selected",
                        )}
                        onClick={() => chooseModel(item.id)}
                      >
                        <BrandAvatar
                          src={modelIconSrc({
                            remoteId: item.remoteId,
                            name: item.name,
                          })}
                          label={item.name}
                          size={22}
                          rounded="md"
                        />
                        <span className="joy-composer-model-item-text">
                          <span className="joy-composer-model-item-name">
                            {item.name}
                          </span>
                          {item.channel?.name ? (
                            <span className="joy-composer-model-item-id">
                              {item.channel.name}
                            </span>
                          ) : null}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div
                className="joy-chip joy-agent-mode-chip"
                role="group"
                aria-label="执行模式"
              >
                {(
                  [
                    ["assist", "确认"],
                    ["auto", "自动"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    title={
                      value === "assist" ? "生成前先确认" : "生成直接提交"
                    }
                    disabled={locked}
                    onClick={() => chooseMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!busy && !pending && !draft.trim()}
              className={cn(
                "joy-agent-composer-send",
                (busy || pending) && "is-stop",
              )}
              aria-label={busy || pending ? "停止" : "发送"}
            >
              {busy || pending ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ChatSessionButtons({
  historyOpen,
  onNew,
  onHistory,
}: {
  historyOpen: boolean;
  onNew: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className="joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg"
        aria-label="新对话"
        title="新对话"
        onClick={onNew}
      >
        <Plus className="size-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          "joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg",
          historyOpen && "is-active",
        )}
        aria-label="历史会话"
        aria-pressed={historyOpen}
        title="历史会话"
        onClick={onHistory}
      >
        <History className="size-3.5" />
      </button>
    </div>
  );
}
