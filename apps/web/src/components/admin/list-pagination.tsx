"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZES = [12, 24, 48] as const;

type ListPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
};

export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        共 <span className="tabular-nums text-foreground">{total}</span> 条
        {total > 0 ? (
          <>
            {" · "}
            <span className="tabular-nums">
              {from}–{to}
            </span>
          </>
        ) : null}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-9 w-[104px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / 页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-xl"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="上一页"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-muted-foreground">
            {safePage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-xl"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="下一页"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
