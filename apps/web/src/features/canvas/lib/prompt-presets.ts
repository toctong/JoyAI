/** Browser-local prompt presets for canvas generate panel (CRUD). */

export type PromptPreset = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export type PromptPresetInput = {
  title: string;
  text: string;
};

const STORAGE_KEY = "joyai.canvas.prompt-presets";

function now() {
  return Date.now();
}

const TITLE_MAX = 50;
const TEXT_MAX = 5000;

function normalizeTitle(title: string, text: string) {
  const t = title.trim() || text.trim().slice(0, 24);
  return t.slice(0, TITLE_MAX) || "未命名预设";
}

function parseList(raw: string | null): PromptPreset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const text = String(row.text ?? "").trim();
        if (!text) return null;
        const id = String(row.id ?? "").trim() || crypto.randomUUID();
        const createdAt =
          typeof row.createdAt === "number"
            ? row.createdAt
            : typeof row.updatedAt === "number"
              ? row.updatedAt
              : now();
        const updatedAt =
          typeof row.updatedAt === "number" ? row.updatedAt : createdAt;
        return {
          id,
          title: normalizeTitle(String(row.title ?? ""), text),
          text,
          createdAt,
          updatedAt,
        } satisfies PromptPreset;
      })
      .filter((item): item is PromptPreset => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persist(list: PromptPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

export function listPromptPresets(): PromptPreset[] {
  if (typeof window === "undefined") return [];
  try {
    return parseList(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function getPromptPreset(id: string): PromptPreset | null {
  return listPromptPresets().find((item) => item.id === id) ?? null;
}

export function createPromptPreset(input: PromptPresetInput): PromptPreset {
  const text = input.text.trim().slice(0, TEXT_MAX);
  if (!text) throw new Error("提示词不能为空");
  const stamp = now();
  const item: PromptPreset = {
    id: crypto.randomUUID(),
    title: normalizeTitle(input.title.slice(0, TITLE_MAX), text),
    text,
    createdAt: stamp,
    updatedAt: stamp,
  };
  persist([item, ...listPromptPresets()]);
  return item;
}

export function updatePromptPreset(
  id: string,
  input: PromptPresetInput,
): PromptPreset {
  const text = input.text.trim().slice(0, TEXT_MAX);
  if (!text) throw new Error("提示词不能为空");
  const list = listPromptPresets();
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("预设不存在");
  const prev = list[index]!;
  const next: PromptPreset = {
    ...prev,
    title: normalizeTitle(input.title.slice(0, TITLE_MAX), text),
    text,
    updatedAt: now(),
  };
  const copy = [...list];
  copy[index] = next;
  persist(copy.sort((a, b) => b.updatedAt - a.updatedAt));
  return next;
}

export function deletePromptPreset(id: string): boolean {
  const list = listPromptPresets();
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  persist(next);
  return true;
}

export function replacePromptPresets(list: PromptPreset[]) {
  persist(
    [...list].sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

/** Merge imported presets (new ids) into local store. */
export function importPromptPresets(raw: unknown): number {
  if (!Array.isArray(raw)) throw new Error("格式无效");
  const stamp = now();
  const incoming: PromptPreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    incoming.push({
      id: crypto.randomUUID(),
      title: normalizeTitle(String(row.title ?? ""), text),
      text,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  if (!incoming.length) throw new Error("没有可用预设");
  persist([...incoming, ...listPromptPresets()]);
  return incoming.length;
}

export function exportPromptPresetsJson(list?: PromptPreset[]): string {
  return JSON.stringify(list ?? listPromptPresets(), null, 2);
}

export const PROMPT_PRESET_TITLE_MAX = TITLE_MAX;
export const PROMPT_PRESET_TEXT_MAX = TEXT_MAX;
