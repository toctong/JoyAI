import { normalizeCanvasSnapshot, type CanvasSnapshot } from "@joyai/shared";

export const JOYAI_CANVAS_EXPORT_APP = "joyai" as const;
export const JOYAI_CANVAS_EXPORT_VERSION = 1 as const;

export type JoyaiCanvasProjectFile = {
  app: typeof JOYAI_CANVAS_EXPORT_APP;
  version: typeof JOYAI_CANVAS_EXPORT_VERSION;
  exportedAt: string;
  project: {
    title: string;
    folderId?: string | null;
    snapshot: CanvasSnapshot;
  };
};

export type JoyaiCanvasBundleFile = {
  app: typeof JOYAI_CANVAS_EXPORT_APP;
  version: typeof JOYAI_CANVAS_EXPORT_VERSION;
  exportedAt: string;
  projects: Array<{
    title: string;
    folderId?: string | null;
    snapshot: CanvasSnapshot;
  }>;
};

function stripHeavyNodeData(data: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...data };
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (typeof value === "string" && value.startsWith("data:")) {
      delete next[key];
    }
  }
  // In-flight jobs should not resume after import
  if ("jobId" in next) next.jobId = "";
  const status = String(next.status ?? "");
  if (status === "queued" || status === "running" || status === "polling") {
    next.status = "idle";
    next.error = "";
  }
  return next;
}

/** Prepare snapshot for portable JSON (no data URLs / active jobs). */
export function sanitizeSnapshotForExport(
  snapshot: CanvasSnapshot,
): CanvasSnapshot {
  return {
    version: 2,
    viewport: { ...snapshot.viewport },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      data: stripHeavyNodeData({ ...node.data }),
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  };
}

export function buildProjectExport(opts: {
  title: string;
  folderId?: string | null;
  snapshot: CanvasSnapshot;
}): JoyaiCanvasProjectFile {
  return {
    app: JOYAI_CANVAS_EXPORT_APP,
    version: JOYAI_CANVAS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      title: opts.title.trim() || "未命名项目",
      folderId: opts.folderId ?? null,
      snapshot: sanitizeSnapshotForExport(opts.snapshot),
    },
  };
}

export function buildBundleExport(
  projects: Array<{
    title: string;
    folderId?: string | null;
    snapshot: CanvasSnapshot;
  }>,
): JoyaiCanvasBundleFile {
  return {
    app: JOYAI_CANVAS_EXPORT_APP,
    version: JOYAI_CANVAS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.map((item) => ({
      title: item.title.trim() || "未命名项目",
      folderId: item.folderId ?? null,
      snapshot: sanitizeSnapshotForExport(item.snapshot),
    })),
  };
}

export function parseCanvasImport(raw: unknown): Array<{
  title: string;
  folderId: string | null;
  snapshot: CanvasSnapshot;
}> {
  if (!raw || typeof raw !== "object") {
    throw new Error("无效的画布 JSON");
  }
  const obj = raw as Record<string, unknown>;

  // Bare snapshot
  const bare = normalizeCanvasSnapshot(raw);
  if (bare) {
    return [{ title: "导入的项目", folderId: null, snapshot: bare }];
  }

  if (obj.app !== JOYAI_CANVAS_EXPORT_APP) {
    // Allow snapshot nested under common keys
    const nested =
      normalizeCanvasSnapshot(obj.snapshot) ||
      normalizeCanvasSnapshot(obj.project);
    if (nested) {
      return [{ title: "导入的项目", folderId: null, snapshot: nested }];
    }
  }

  if (obj.project && typeof obj.project === "object") {
    const project = obj.project as Record<string, unknown>;
    const snapshot = normalizeCanvasSnapshot(project.snapshot);
    if (!snapshot) throw new Error("项目快照无效");
    return [
      {
        title: String(project.title ?? "导入的项目").trim() || "导入的项目",
        folderId: null,
        snapshot: sanitizeSnapshotForExport(snapshot),
      },
    ];
  }

  if (Array.isArray(obj.projects)) {
    const list: Array<{
      title: string;
      folderId: string | null;
      snapshot: CanvasSnapshot;
    }> = [];
    for (const item of obj.projects) {
      if (!item || typeof item !== "object") continue;
      const project = item as Record<string, unknown>;
      const snapshot = normalizeCanvasSnapshot(project.snapshot);
      if (!snapshot) continue;
      list.push({
        title: String(project.title ?? "导入的项目").trim() || "导入的项目",
        folderId: null,
        snapshot: sanitizeSnapshotForExport(snapshot),
      });
    }
    if (!list.length) throw new Error("文件中没有有效项目");
    return list;
  }

  throw new Error("无法识别的画布导出格式");
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(title: string) {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, "_") || "framerally-canvas";
  return base.slice(0, 80);
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("JSON 解析失败");
  }
}
