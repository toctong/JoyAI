"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeCanvasAgentChat,
  type CanvasAgentChatMessage,
  type CanvasAgentChatState,
} from "@joyai/shared";
import { api, isApiCancelError } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";

export type { CanvasAgentChatMessage };
export type CanvasAgentConversation = CanvasAgentChatState["conversations"][number];

const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES_PER_CONV = 200;

function storageKey(projectId: string) {
  return `joyai.canvas.agent.chat.${projectId}`;
}

function uid(prefix = "c") {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function blankAgentConversation(): CanvasAgentConversation {
  return {
    id: uid("conv"),
    title: "新对话",
    updatedAt: Date.now(),
    messages: [],
  };
}

function titleFromPrompt(prompt: string) {
  const t = prompt.trim().replace(/\s+/g, " ");
  return t.length > 18 ? `${t.slice(0, 18)}…` : t || "新对话";
}

function readLegacy(projectId: string): CanvasAgentChatState | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return normalizeCanvasAgentChat(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function blankState(): CanvasAgentChatState {
  const conv = blankAgentConversation();
  return { activeId: conv.id, conversations: [conv] };
}

function hasMessages(state: CanvasAgentChatState | null) {
  return Boolean(state?.conversations.some((item) => item.messages.length > 0));
}

/** Recent user/assistant turns for the model (skip system noise). */
export function formatChatHistoryForPrompt(
  messages: CanvasAgentChatMessage[],
  opts?: { limit?: number; maxChars?: number },
) {
  const limit = opts?.limit ?? 8;
  const maxChars = opts?.maxChars ?? 900;
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => {
      const body = m.content.trim().slice(0, maxChars);
      const who = m.role === "user" ? "用户" : "助手";
      return `${who}：${body || "（空）"}`;
    })
    .join("\n\n");
}

/**
 * Per-project Agent chats on the server (`project_chat`), not in the canvas snapshot.
 * A one-time read of the old localStorage key migrates this browser's history.
 */
export function useCanvasAgentChat(projectId: string) {
  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<CanvasAgentConversation[]>(
    [],
  );
  const [activeId, setActiveId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
          `/canvas/projects/${projectId}/agent-chat`,
        );
        if (cancelled) return;
        const remoteState = normalizeCanvasAgentChat(remote);
        const legacy = readLegacy(projectId);
        const useLegacy = !hasMessages(remoteState) && hasMessages(legacy);
        const state = (useLegacy ? legacy : remoteState) ?? blankState();
        hadRemoteRef.current = Boolean(remoteState);
        setConversations(state.conversations);
        setActiveId(state.activeId);
        loadedForRef.current = projectId;
        setHydrated(true);
      } catch (error) {
        if (cancelled || isApiCancelError(error)) return;
        toast.error("会话加载失败");
        const blank = blankState();
        setConversations(blank.conversations);
        setActiveId(blank.activeId);
        loadedForRef.current = projectId;
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated || loadedForRef.current !== projectId) return;
    const payload: CanvasAgentChatState = { activeId, conversations };
    const hasAny = hasMessages(payload);
    if (!hasAny && !hadRemoteRef.current) return;
    const legacyKey = hasAny ? storageKey(projectId) : null;
    const timer = window.setTimeout(() => {
      void api(`/canvas/projects/${projectId}/agent-chat`, {
        method: "PUT",
        body: payload,
      })
        .then(() => {
          if (loadedForRef.current === projectId) hadRemoteRef.current = true;
          if (legacyKey) localStorage.removeItem(legacyKey);
        })
        .catch((error) => {
          if (isApiCancelError(error)) return;
          toast.error("会话保存失败");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeId, conversations, hydrated, projectId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [activeId, conversations],
  );

  const messages = activeConversation?.messages ?? [];

  const patchActive = useCallback(
    (fn: (conv: CanvasAgentConversation) => CanvasAgentConversation) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? fn({ ...c, updatedAt: Date.now() }) : c,
        ),
      );
    },
    [activeId],
  );

  const appendMessage = useCallback(
    (msg: Omit<CanvasAgentChatMessage, "id" | "createdAt"> & { id?: string }) => {
      const next: CanvasAgentChatMessage = {
        id: msg.id ?? uid("msg"),
        role: msg.role,
        content: msg.content,
        createdAt: Date.now(),
      };
      patchActive((c) => {
        const titled =
          c.title === "新对话" && msg.role === "user"
            ? titleFromPrompt(msg.content)
            : c.title;
        return {
          ...c,
          title: titled,
          messages: [...c.messages, next].slice(-MAX_MESSAGES_PER_CONV),
        };
      });
      return next.id;
    },
    [patchActive],
  );

  const createNewChat = useCallback(() => {
    const conv = blankAgentConversation();
    setConversations((prev) => [conv, ...prev].slice(0, MAX_CONVERSATIONS));
    setActiveId(conv.id);
    setHistoryOpen(false);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setHistoryOpen(false);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (next.length === 0) {
          const blank = blankAgentConversation();
          setActiveId(blank.id);
          return [blank];
        }
        if (id === activeId) setActiveId(next[0]!.id);
        return next;
      });
    },
    [activeId],
  );

  return {
    hydrated,
    conversations,
    activeConversation,
    activeId,
    messages,
    historyOpen,
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    createNewChat,
    selectConversation,
    deleteConversation,
    appendMessage,
  };
}
