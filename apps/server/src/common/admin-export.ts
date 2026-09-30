/** Admin JSON 导入导出信封（各资源共用） */

export type AdminExportKind =
  | "voices"
  | "channels"
  | "models"
  | "styles"
  | "camera-moves"
  | "prompt-presets"
  | "skills"
  | "inspire-banners";

export type AdminExportEnvelope<T> = {
  app: "framerally";
  kind: AdminExportKind;
  version: 1;
  exportedAt: string;
  items: T[];
};

export function makeAdminExport<T>(
  kind: AdminExportKind,
  items: T[],
): AdminExportEnvelope<T> {
  return {
    app: "framerally",
    kind,
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
}

export function parseAdminImportItems<T>(
  body: unknown,
  kind: AdminExportKind,
): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const env = body as Partial<AdminExportEnvelope<T>>;
    if (Array.isArray(env.items)) {
      if (env.kind && env.kind !== kind) {
        throw new Error(`导入类型不匹配：期望 ${kind}，实际 ${env.kind}`);
      }
      return env.items;
    }
  }
  throw new Error("无效的导入文件：需要 items 数组或信封 JSON");
}

/** 解析导出勾选 ids（支持 ids=a&ids=b 或 ids=a,b） */
export function normalizeExportIds(
  raw?: string | string[] | null,
): string[] | undefined {
  if (raw == null) return undefined;
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  return [...new Set(parts)];
}
