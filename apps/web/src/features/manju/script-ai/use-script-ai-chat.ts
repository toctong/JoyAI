"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeScriptProjectChat, type ScriptProjectChatState } from "@joyai/shared";
import { api, isApiCancelError } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { toast } from "@/shared/lib/toast";
import { submitManjuScriptWriteJob } from "../manju-api";
import type { ScriptAiType } from "./script-ai-templates";

export type ScriptAiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  script?: string;
  /** 本集钩子，应用时写入分集 */
  hook?: string;
  scriptApplied?: boolean;
  pending?: boolean;
  error?: boolean;
  jobId?: string;
};

export type ScriptAiConversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ScriptAiMessage[];
  aiType: ScriptAiType;
};

function storageKey(projectId: string) {
  return `joyai.manju.script-ai.${projectId}`;
}

function uid() {
  return crypto.randomUUID();
}

function blankConversation(aiType: ScriptAiType = "都市情感"): ScriptAiConversation {
  return {
    id: uid(),
    title: "新对话",
    updatedAt: Date.now(),
    messages: [],
    aiType,
  };
}

function readLegacy(projectId: string): ScriptProjectChatState | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return normalizeScriptProjectChat(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function recoverInterrupted(state: ScriptProjectChatState): ScriptProjectChatState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.pending
          ? {
              ...message,
              pending: false,
              error: true,
              content: message.content || "生成中断，请重试",
            }
          : message,
      ),
    })),
  };
}

function blankState(aiType: ScriptAiConversation["aiType"] = "都市情感"): ScriptProjectChatState {
  const conv = blankConversation(aiType);
  return { activeId: conv.id, conversations: [conv] };
}

function hasMessages(state: ScriptProjectChatState | null) {
  return Boolean(state?.conversations.some((item) => item.messages.length > 0));
}

function titleFromPrompt(prompt: string) {
  const t = prompt.trim().replace(/\s+/g, " ");
  return t.length > 18 ? `${t.slice(0, 18)}…` : t || "新对话";
}

function buildJobPrompt(input: {
  aiType: string;
  userText: string;
  history: ScriptAiMessage[];
  scriptRef?: string | null;
}) {
  const recent = input.history
    .filter((m) => !m.pending && !m.error)
    .slice(-6)
    .map((m) => {
      const body = m.script?.trim()
        ? `${m.content}\n【剧本片段】\n${m.script.slice(0, 1200)}`
        : m.content;
      return `${m.role === "user" ? "用户" : "助手"}：${body}`;
    })
    .join("\n");

  const parts = [
    `【创作类型】${input.aiType}`,
    `【用户需求】\n${input.userText.trim()}`,
  ];
  if (recent) parts.push(`【近期对话】\n${recent}`);
  if (input.scriptRef?.trim()) {
    parts.push(
      `【当前剧本（请在此基础上修改，输出完整改定稿）】\n${input.scriptRef.trim().slice(0, 40_000)}`,
    );
  }
  parts.push("请按系统约定只输出 JSON。");
  return parts.join("\n\n");
}

export function useScriptAiChat(input: {
  projectId: string;
  modelId?: string;
  scriptText: string;
  onApplyScript: (script: string, meta?: { hook?: string }) => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<ScriptAiConversation[]>(
    [],
  );
  const [activeId, setActiveId] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scriptRefEnabled, setScriptRefEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const pendingJobRef = useRef<string | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const hadRemoteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadedForRef.current = null;
    hadRemoteRef.current = false;
    setHydrated(false);
    setHistoryOpen(false);
    setConversations([]);
    setActiveId("");

    void (async () => {
      try {
        const remote = await api<unknown>(
          `/manju/projects/${input.projectId}/script-chat`,
        );
        if (cancelled) return;
        const remoteState = normalizeScriptProjectChat(remote);
        const legacy = readLegacy(input.projectId);
        const useLegacy = !hasMessages(remoteState) && hasMessages(legacy);
        const state = recoverInterrupted(
          (useLegacy ? legacy : remoteState) ?? blankState(),
        );
        hadRemoteRef.current = Boolean(remoteState);
        setConversations(state.conversations as ScriptAiConversation[]);
        setActiveId(state.activeId);
        loadedForRef.current = input.projectId;
        setHydrated(true);
      } catch (error) {
        if (cancelled || isApiCancelError(error)) return;
        toast.error("会话加载失败");
        const blank = blankState();
        setConversations(blank.conversations);
        setActiveId(blank.activeId);
        loadedForRef.current = input.projectId;
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input.projectId]);

  useEffect(() => {
    if (!hydrated || loadedForRef.current !== input.projectId) return;
    const payload: ScriptProjectChatState = { activeId, conversations };
    const hasAny = hasMessages(payload);
    if (!hasAny && !hadRemoteRef.current) return;
    const legacyKey = hasAny ? storageKey(input.projectId) : null;
    const timer = window.setTimeout(() => {
      void api(`/manju/projects/${input.projectId}/script-chat`, {
        method: "PUT",
        body: payload,
      })
        .then(() => {
          if (loadedForRef.current === input.projectId) hadRemoteRef.current = true;
          if (legacyKey) localStorage.removeItem(legacyKey);
        })
        .catch((error) => {
          if (isApiCancelError(error)) return;
          toast.error("会话保存失败");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeId, conversations, hydrated, input.projectId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [activeId, conversations],
  );

  const messages = activeConversation?.messages ?? [];
  const aiType = activeConversation?.aiType ?? "都市情感";

  const patchActive = useCallback(
    (fn: (conv: ScriptAiConversation) => ScriptAiConversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? fn({ ...c, updatedAt: Date.now() }) : c)),
      );
    },
    [activeId],
  );

  const setAiType = useCallback(
    (next: ScriptAiType) => {
      patchActive((c) => ({ ...c, aiType: next }));
    },
    [patchActive],
  );

  const createNewChat = useCallback(() => {
    const conv = blankConversation(aiType);
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setHistoryOpen(false);
    setDraftPrompt("");
  }, [aiType]);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setHistoryOpen(false);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (next.length === 0) {
          const blank = blankConversation();
          setActiveId(blank.id);
          return [blank];
        }
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  const finishAssistant = useCallback(
    (
      jobId: string,
      result:
        | { reply?: string; script?: string; hook?: string; error?: string }
        | null
        | undefined,
    ) => {
      if (pendingJobRef.current !== jobId) return;
      pendingJobRef.current = null;
      setSending(false);
      patchActive((c) => ({
        ...c,
        messages: c.messages.map((m) => {
          if (m.jobId !== jobId) return m;
          if (result?.error) {
            return {
              ...m,
              pending: false,
              error: true,
              content: result.error,
              script: undefined,
              hook: undefined,
            };
          }
          const reply = result?.reply?.trim() || "";
          const script = result?.script?.trim() || "";
          const hook = result?.hook?.trim() || "";
          return {
            ...m,
            pending: false,
            error: false,
            content: reply || (script ? "已生成剧本，可应用到右侧。" : "已完成"),
            script: script || undefined,
            hook: hook || undefined,
          };
        }),
      }));
    },
    [patchActive],
  );

  useJobLifecycle({
    getBusyJobIds: () => {
      const id = pendingJobRef.current;
      return id ? [id] : [];
    },
    onCompleted: (payload) => {
      const jobId = payload.jobId;
      if (!jobId || pendingJobRef.current !== jobId) return;
      if (payload.result?.purpose && payload.result.purpose !== "script_write") {
        return;
      }
      finishAssistant(jobId, payload.result?.scriptWrite ?? {});
    },
    onFailed: (payload) => {
      const jobId = payload.jobId;
      if (!jobId || pendingJobRef.current !== jobId) return;
      finishAssistant(jobId, {
        error: payload.error?.trim() || "生成失败，请重试",
      });
      toast.error(payload.error?.trim() || "AI 帮写失败");
    },
  });

  const sendMessage = useCallback(
    async (text: string, opts?: { scriptRef?: boolean }) => {
      const prompt = text.trim();
      if (!prompt || sending || !activeConversation) return;

      const useRef = Boolean(opts?.scriptRef);
      if (useRef && !input.scriptText.trim()) {
        toast.message("右侧剧本为空，无法引用润色");
        return;
      }

      const userMsg: ScriptAiMessage = {
        id: uid(),
        role: "user",
        content: prompt,
      };
      const assistantId = uid();
      const historyForPrompt = [...activeConversation.messages, userMsg];

      patchActive((c) => ({
        ...c,
        title:
          c.messages.length === 0 ? titleFromPrompt(prompt) : c.title,
        messages: [
          ...c.messages,
          userMsg,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            pending: true,
          },
        ],
      }));
      setDraftPrompt("");
      setSending(true);

      try {
        const jobPrompt = buildJobPrompt({
          aiType: activeConversation.aiType,
          userText: prompt,
          history: historyForPrompt,
          scriptRef: useRef ? input.scriptText : null,
        });
        const job = await submitManjuScriptWriteJob({
          projectId: input.projectId,
          prompt: jobPrompt,
          modelId: input.modelId,
        });
        pendingJobRef.current = job.id;
        patchActive((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, jobId: job.id } : m,
          ),
        }));
      } catch (e) {
        setSending(false);
        pendingJobRef.current = null;
        const err = e instanceof Error ? e.message : "提交失败";
        patchActive((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId
              ? { ...m, pending: false, error: true, content: err }
              : m,
          ),
        }));
        toast.error(err);
      }
    },
    [
      activeConversation,
      input.modelId,
      input.projectId,
      input.scriptText,
      patchActive,
      sending,
    ],
  );

  const retryMessage = useCallback(
    (messageId: string, opts?: { scriptRef?: boolean }) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      const failed = messages[idx];
      if (failed.role !== "assistant" || !failed.error) return;
      const prevUser = [...messages]
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      if (!prevUser) return;
      patchActive((c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== messageId),
      }));
      void sendMessage(prevUser.content, opts);
    },
    [messages, patchActive, sendMessage],
  );

  const applyMessageScript = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.script?.trim()) return;
      input.onApplyScript(msg.script, { hook: msg.hook });
      patchActive((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, scriptApplied: true } : m,
        ),
      }));
      toast.success("已应用到右侧剧本");
    },
    [input, messages, patchActive],
  );

  return {
    hydrated,
    conversations,
    activeConversation,
    messages,
    aiType,
    setAiType,
    draftPrompt,
    setDraftPrompt,
    historyOpen,
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    scriptRefEnabled,
    setScriptRefEnabled,
    sending,
    createNewChat,
    selectConversation,
    deleteConversation,
    sendMessage,
    retryMessage,
    applyMessageScript,
  };
}
