"use client";

import { pushAppNotify, type AppNotifyAsset } from "@/shared/lib/app-notify-store";
import { pushGenerationInbox } from "@/shared/lib/generation-inbox-store";

export type GenerationNotifyKind = "image" | "video" | string;

export type GenerationNotifyOutcome = {
  jobId: string;
  ok: boolean;
  kind?: GenerationNotifyKind;
  modelName?: string | null;
  prompt?: string | null;
  error?: string | null;
  assets?: AppNotifyAsset[];
};

const BATCH_MS = 2500;
const NOTIFY_TAG = "joyai-studio-generation";
const PANEL_DURATION_MS = 7000;

let pending: GenerationNotifyOutcome[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastBrowserNotification: Notification | null = null;

function isOurTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function kindLabel(kind?: GenerationNotifyKind): string {
  if (kind === "video") return "视频";
  if (kind === "image") return "图片";
  return "任务";
}

function clip(text: string, max = 48): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function countByKind(rows: GenerationNotifyOutcome[]) {
  let images = 0;
  let videos = 0;
  let other = 0;
  for (const row of rows) {
    if (row.kind === "image") images += 1;
    else if (row.kind === "video") videos += 1;
    else other += 1;
  }
  return { images, videos, other };
}

function buildBrowserBody(items: GenerationNotifyOutcome[]): {
  title: string;
  body: string;
} {
  const okList = items.filter((i) => i.ok);
  const failList = items.filter((i) => !i.ok);
  const parts: string[] = [];
  if (okList.length === 1) {
    parts.push(`${kindLabel(okList[0]!.kind)}生成完成`);
  } else if (okList.length > 1) {
    const c = countByKind(okList);
    const bits: string[] = [];
    if (c.images) bits.push(`图片 ${c.images}`);
    if (c.videos) bits.push(`视频 ${c.videos}`);
    if (c.other) bits.push(`其他 ${c.other}`);
    parts.push(`${okList.length} 个完成（${bits.join(" · ")}）`);
  }
  if (failList.length === 1) {
    parts.push(`${kindLabel(failList[0]!.kind)}生成失败`);
  } else if (failList.length > 1) {
    parts.push(`${failList.length} 个失败`);
  }
  return {
    title: "FrameRally 创作",
    body: parts.join("；") || "生成结束",
  };
}

function buildPanel(items: GenerationNotifyOutcome[]) {
  const unique = new Map<string, GenerationNotifyOutcome>();
  for (const item of items) unique.set(item.jobId, item);
  const list = [...unique.values()];
  const okList = list.filter((i) => i.ok);
  const failList = list.filter((i) => !i.ok);
  const assets = okList.flatMap((i) => i.assets ?? []).slice(0, 6);
  const lines: string[] = [];

  if (list.length === 1) {
    const one = list[0]!;
    const title = one.ok
      ? `${kindLabel(one.kind)}生成完成`
      : `${kindLabel(one.kind)}生成失败`;
    if (one.modelName?.trim()) {
      lines.push(`模型：${one.modelName.trim()}`);
    }
    if (one.ok) {
      const n = one.assets?.length ?? 0;
      if (n > 0) {
        lines.push(
          one.kind === "video"
            ? `已生成 ${n} 个视频结果`
            : `已生成 ${n} 张图片`,
        );
      } else {
        lines.push("结果已写入创作记录");
      }
      if (one.prompt?.trim()) lines.push(`提示词：${clip(one.prompt)}`);
    } else if (one.error?.trim()) {
      lines.push(clip(one.error, 80));
    } else {
      lines.push("请回创作页查看失败原因");
    }
    return {
      tone: (one.ok ? "success" : "error") as "success" | "error",
      title,
      lines,
      assets: one.ok ? assets : undefined,
    };
  }

  const okCount = okList.length;
  const failCount = failList.length;
  const title =
    okCount && failCount
      ? `创作任务结束：成功 ${okCount} · 失败 ${failCount}`
      : okCount
        ? `${okCount} 个创作任务已完成`
        : `${failCount} 个创作任务失败`;

  if (okCount) {
    const c = countByKind(okList);
    const bits: string[] = [];
    if (c.images) bits.push(`图片 ${c.images}`);
    if (c.videos) bits.push(`视频 ${c.videos}`);
    if (c.other) bits.push(`其他 ${c.other}`);
    lines.push(`成功：${bits.join(" · ") || String(okCount)}`);
  }
  if (failCount) {
    const c = countByKind(failList);
    const bits: string[] = [];
    if (c.images) bits.push(`图片 ${c.images}`);
    if (c.videos) bits.push(`视频 ${c.videos}`);
    if (c.other) bits.push(`其他 ${c.other}`);
    lines.push(`失败：${bits.join(" · ") || String(failCount)}`);
    const firstErr = failList.find((f) => f.error?.trim())?.error?.trim();
    if (firstErr) lines.push(`原因示例：${clip(firstErr, 72)}`);
  }

  const models = [
    ...new Set(
      list
        .map((i) => i.modelName?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  if (models.length === 1) lines.push(`模型：${models[0]}`);
  else if (models.length > 1) lines.push(`涉及 ${models.length} 个模型`);

  return {
    tone: (failCount && !okCount ? "error" : "success") as "success" | "error",
    title,
    lines,
    assets: okCount ? assets : undefined,
  };
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    lastBrowserNotification?.close();
  } catch {
    /* ignore */
  }

  const notification = new Notification(title, {
    body,
    tag: NOTIFY_TAG,
  });
  lastBrowserNotification = notification;
  notification.onclick = () => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    notification.close();
  };
}

function flushPending() {
  flushTimer = null;
  if (!pending.length) return;
  const batch = pending;
  pending = [];

  const unique = new Map<string, GenerationNotifyOutcome>();
  for (const item of batch) unique.set(item.jobId, item);
  const list = [...unique.values()];

  const panel = buildPanel(list);
  const inboxId = list.map((row) => row.jobId).sort().join("|");
  pushGenerationInbox({
    id: `gen-${inboxId}`,
    jobId: list.length === 1 ? list[0]!.jobId : undefined,
    tone: panel.tone,
    title: panel.title,
    lines: panel.lines,
    assets: panel.assets,
    href: "/studio",
  });

  if (isOurTabVisible()) {
    pushAppNotify({
      tone: panel.tone,
      title: panel.title,
      lines: panel.lines,
      assets: panel.assets,
      href: "/studio",
      actionLabel: "查看创作记录",
      durationMs: PANEL_DURATION_MS,
    });
    return;
  }

  const browser = buildBrowserBody(list);
  showBrowserNotification(browser.title, browser.body);
}

/**
 * Batch studio generation outcomes. Visible tab → right-side panel;
 * background tab → browser Notification (when permission granted).
 */
export function notifyStudioGeneration(outcome: GenerationNotifyOutcome) {
  if (typeof window === "undefined") return;
  const jobId = String(outcome.jobId ?? "").trim();
  if (!jobId) return;

  pending.push({
    jobId,
    ok: outcome.ok,
    kind: outcome.kind,
    modelName: outcome.modelName,
    prompt: outcome.prompt,
    error: outcome.error,
    assets: outcome.assets,
  });

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPending, BATCH_MS);
}

/** Call from a user gesture (e.g. submit) so background alerts can work later. */
export async function ensureGenerationNotifyPermission(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
