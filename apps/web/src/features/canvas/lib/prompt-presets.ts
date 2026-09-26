/** Canvas prompt presets — API-backed + localStorage migration helpers. */

import { api } from "@/shared/lib/api";

export type PromptPreset = {
  id: string;
  title: string;
  text: string;
  scope?: "global" | "canvas";
  enabled?: boolean;
  sortOrder?: number;
  createdAt?: string | number;
  updatedAt?: string | number;
};

export type PromptPresetInput = {
  title: string;
  text: string;
};

const STORAGE_KEY = "joyai.canvas.prompt-presets";
const MIGRATED_KEY = "joyai.canvas.prompt-presets.migrated";

export const PROMPT_PRESET_TITLE_MAX = 50;
export const PROMPT_PRESET_TEXT_MAX = 5000;

function normalizeTitle(title: string, text: string) {
  const t = title.trim() || text.trim().slice(0, 24);
  return t.slice(0, PROMPT_PRESET_TITLE_MAX) || "未命名预设";
}

/** Read leftover browser-local presets (pre-server migration). */
export function listLocalPromptPresets(): PromptPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const text = String(row.text ?? "").trim();
        if (!text) return null;
        return {
          id: String(row.id ?? "").trim() || crypto.randomUUID(),
          title: normalizeTitle(String(row.title ?? ""), text),
          text,
        } satisfies PromptPreset;
      })
      .filter((item): item is PromptPreset => Boolean(item));
  } catch {
    return [];
  }
}

export function clearLocalPromptPresets() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasPendingLocalPresetMigration() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(MIGRATED_KEY) === "1") return false;
    return listLocalPromptPresets().length > 0;
  } catch {
    return false;
  }
}

export async function fetchGlobalPresets() {
  return api<PromptPreset[]>("/prompt-presets");
}

export async function fetchCanvasPresets(projectId: string) {
  return api<PromptPreset[]>(
    `/canvas/projects/${projectId}/prompt-presets`,
  );
}

export async function createCanvasPreset(
  projectId: string,
  input: PromptPresetInput,
) {
  return api<PromptPreset>(`/canvas/projects/${projectId}/prompt-presets`, {
    method: "POST",
    body: {
      title: normalizeTitle(input.title, input.text),
      text: input.text.trim().slice(0, PROMPT_PRESET_TEXT_MAX),
    },
  });
}

export async function updateCanvasPreset(
  projectId: string,
  id: string,
  input: PromptPresetInput,
) {
  return api<PromptPreset>(
    `/canvas/projects/${projectId}/prompt-presets/${id}`,
    {
      method: "PATCH",
      body: {
        title: normalizeTitle(input.title, input.text),
        text: input.text.trim().slice(0, PROMPT_PRESET_TEXT_MAX),
      },
    },
  );
}

export async function deleteCanvasPreset(projectId: string, id: string) {
  return api<{ ok: boolean }>(
    `/canvas/projects/${projectId}/prompt-presets/${id}`,
    { method: "DELETE" },
  );
}

export async function importCanvasPresets(
  projectId: string,
  items: PromptPresetInput[],
) {
  return api<{ count: number }>(
    `/canvas/projects/${projectId}/prompt-presets/import`,
    {
      method: "POST",
      body: {
        items: items.map((item) => ({
          title: normalizeTitle(item.title, item.text),
          text: item.text.trim().slice(0, PROMPT_PRESET_TEXT_MAX),
        })),
      },
    },
  );
}

export function exportPromptPresetsJson(list: PromptPreset[]): string {
  return JSON.stringify(
    list.map((p) => ({ title: p.title, text: p.text })),
    null,
    2,
  );
}

export function parseImportPayload(raw: unknown): PromptPresetInput[] {
  if (!Array.isArray(raw)) throw new Error("格式无效");
  const items: PromptPresetInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    items.push({
      title: normalizeTitle(String(row.title ?? ""), text),
      text,
    });
  }
  if (!items.length) throw new Error("没有可用预设");
  return items;
}
