"use client";

import { useCallback, useState } from "react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import {
  downloadJson,
  pickJsonFile,
  readJsonFile,
  stampFilename,
} from "@/features/admin/admin-json-io";

type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  total?: number;
};

function exportUrl(path: string, selectedIds?: string[]) {
  const ids = (selectedIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return path;
  const qs = ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
  return `${path}?${qs}`;
}

/** 管理端列表：导出 / 导入 JSON（勾选导出所选，未勾选导出全部） */
export function useAdminImportExport(opts: {
  kind: string;
  exportPath: string;
  importPath: string;
  /** 当前勾选 id；有值则只导出这些，否则全量 */
  selectedIds?: string[];
  onDone?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = useCallback(async () => {
    setBusy("export");
    try {
      const ids = (opts.selectedIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean);
      const data = await api<unknown>(exportUrl(opts.exportPath, ids));
      downloadJson(stampFilename(opts.kind), data);
      toast.success(
        ids.length ? `已导出所选 ${ids.length} 条` : "已导出全部",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(null);
    }
  }, [opts.exportPath, opts.kind, opts.selectedIds]);

  const handleImport = useCallback(async () => {
    const file = await pickJsonFile();
    if (!file) return;
    setBusy("import");
    try {
      const body = await readJsonFile(file);
      const res = await api<ImportResult>(opts.importPath, {
        method: "POST",
        body,
      });
      const parts = [
        res.created != null ? `新建 ${res.created}` : null,
        res.updated != null ? `更新 ${res.updated}` : null,
        res.skipped != null && res.skipped > 0 ? `跳过 ${res.skipped}` : null,
      ].filter(Boolean);
      toast.success(
        parts.length ? `导入完成：${parts.join(" · ")}` : "导入完成",
      );
      await opts.onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(null);
    }
  }, [opts]);

  return {
    busy,
    exporting: busy === "export",
    importing: busy === "import",
    handleExport,
    handleImport,
  };
}
