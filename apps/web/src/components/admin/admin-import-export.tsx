"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  exporting?: boolean;
  importing?: boolean;
  /** 勾选数量；>0 显示「导出所选」，否则「导出全部」 */
  selectedCount?: number;
  onExport: () => void;
  onImport: () => void;
  className?: string;
};

/** 管理端列表通用：导出（勾选/全量） / 导入 JSON */
export function AdminImportExportButtons({
  exporting,
  importing,
  selectedCount = 0,
  onExport,
  onImport,
  className,
}: Props) {
  const busy = Boolean(exporting || importing);
  const exportLabel =
    selectedCount > 0 ? `导出所选 (${selectedCount})` : "导出全部";
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <Button
        size="sm"
        variant="outline"
        className="h-9 rounded-xl"
        disabled={busy}
        onClick={onExport}
        title={
          selectedCount > 0
            ? "仅导出当前勾选的条目"
            : "未勾选时导出全部"
        }
      >
        {exporting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {exportLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-9 rounded-xl"
        disabled={busy}
        onClick={onImport}
      >
        {importing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        导入
      </Button>
    </div>
  );
}
