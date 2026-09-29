import { SCRIPT_WRITE_GENRES, type ScriptWriteGenre } from "./manju/script-write-genres";

const DATA_URL = /data:[^\s"'<>]+;base64,[a-z0-9+/=\s]+/gi;

function clip(value: unknown, max: number) {
  const text = typeof value === "string" ? value : "";
  return text.replace(DATA_URL, "").slice(0, max);
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export const CANVAS_AGENT_CHAT_LIMITS = {
  conversations: 40,
  messages: 200,
  content: 8_000,
  title: 40,
} as const;

export type CanvasAgentChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};

export type CanvasAgentChatState = {
  activeId: string;
  conversations: {
    id: string;
    title: string;
    updatedAt: number;
    messages: CanvasAgentChatMessage[];
  }[];
};

/** Text-only canvas Agent history. Drops data URLs and over-long turns. */
export function normalizeCanvasAgentChat(raw: unknown): CanvasAgentChatState | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { activeId?: unknown; conversations?: unknown };
  if (!Array.isArray(body.conversations) || body.conversations.length === 0) {
    return null;
  }
  const conversations = body.conversations
    .slice(0, CANVAS_AGENT_CHAT_LIMITS.conversations)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = clip(row.id, 80).trim();
      if (!id) return [];
      const messages = (Array.isArray(row.messages) ? row.messages : [])
        .slice(-CANVAS_AGENT_CHAT_LIMITS.messages)
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const msg = entry as Record<string, unknown>;
          const mid = clip(msg.id, 80).trim();
          const role =
            msg.role === "user" || msg.role === "assistant" || msg.role === "system"
              ? (msg.role as CanvasAgentChatMessage["role"])
              : null;
          if (!mid || !role) return [];
          const content = clip(msg.content, CANVAS_AGENT_CHAT_LIMITS.content).trim();
          if (!content) return [];
          const next: CanvasAgentChatMessage = {
            id: mid,
            role,
            content,
            createdAt: finite(msg.createdAt, Date.now()),
          };
          return [next];
        });
      return [
        {
          id,
          title: clip(row.title, CANVAS_AGENT_CHAT_LIMITS.title).trim() || "新对话",
          updatedAt: finite(row.updatedAt, Date.now()),
          messages,
        } satisfies CanvasAgentChatState["conversations"][number],
      ];
    });
  if (!conversations.length) return null;
  const activeRaw = clip(body.activeId, 80).trim();
  const activeId = conversations.some((item) => item.id === activeRaw)
    ? activeRaw
    : conversations[0]!.id;
  return { activeId, conversations };
}

export const SCRIPT_PROJECT_CHAT_LIMITS = {
  conversations: 40,
  messages: 80,
  content: 8_000,
  script: 40_000,
  hook: 2_000,
  title: 40,
  tags: 8,
  tagLen: 16,
} as const;

export type ScriptProjectChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  script?: string;
  hook?: string;
  tags?: string[];
  scriptApplied?: boolean;
  pending?: boolean;
  error?: boolean;
  jobId?: string;
};

export type ScriptProjectChatState = {
  activeId: string;
  conversations: {
    id: string;
    title: string;
    updatedAt: number;
    aiType: ScriptWriteGenre;
    messages: ScriptProjectChatMessage[];
  }[];
};

const GENRE_SET = new Set<string>(SCRIPT_WRITE_GENRES);

function genreOf(value: unknown): ScriptWriteGenre {
  const text = clip(value, 32).trim();
  return GENRE_SET.has(text) ? (text as ScriptWriteGenre) : "其他";
}

/** Manju script-write history. Separate from the project draft. */
export function normalizeScriptProjectChat(raw: unknown): ScriptProjectChatState | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { activeId?: unknown; conversations?: unknown };
  if (!Array.isArray(body.conversations) || body.conversations.length === 0) {
    return null;
  }
  const conversations = body.conversations
    .slice(0, SCRIPT_PROJECT_CHAT_LIMITS.conversations)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = clip(row.id, 80).trim();
      if (!id) return [];
      const messages = (Array.isArray(row.messages) ? row.messages : [])
        .slice(-SCRIPT_PROJECT_CHAT_LIMITS.messages)
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const msg = entry as Record<string, unknown>;
          const mid = clip(msg.id, 80).trim();
          const role =
            msg.role === "user" || msg.role === "assistant"
              ? (msg.role as ScriptProjectChatMessage["role"])
              : null;
          if (!mid || !role) return [];
          const content = clip(msg.content, SCRIPT_PROJECT_CHAT_LIMITS.content).trim();
          const script = clip(msg.script, SCRIPT_PROJECT_CHAT_LIMITS.script).trim();
          const hook = clip(msg.hook, SCRIPT_PROJECT_CHAT_LIMITS.hook).trim();
          if (!content && !script) return [];
          const next: ScriptProjectChatMessage = { id: mid, role, content };
          if (script) next.script = script;
          if (hook) next.hook = hook;
          if (Array.isArray(msg.tags)) {
            const tags = msg.tags
              .filter((t): t is string => typeof t === "string")
              .map((t) => clip(t, SCRIPT_PROJECT_CHAT_LIMITS.tagLen).trim())
              .filter(Boolean)
              .slice(0, SCRIPT_PROJECT_CHAT_LIMITS.tags);
            if (tags.length) next.tags = tags;
          }
          if (msg.scriptApplied === true) next.scriptApplied = true;
          if (msg.pending === true) next.pending = true;
          if (msg.error === true) next.error = true;
          const jobId = clip(msg.jobId, 80).trim();
          if (jobId) next.jobId = jobId;
          return [next];
        });
      return [
        {
          id,
          title: clip(row.title, SCRIPT_PROJECT_CHAT_LIMITS.title).trim() || "新对话",
          updatedAt: finite(row.updatedAt, Date.now()),
          aiType: genreOf(row.aiType),
          messages,
        } satisfies ScriptProjectChatState["conversations"][number],
      ];
    });
  if (!conversations.length) return null;
  const activeRaw = clip(body.activeId, 80).trim();
  const activeId = conversations.some((item) => item.id === activeRaw)
    ? activeRaw
    : conversations[0]!.id;
  return { activeId, conversations };
}
