"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /**
   * When false, skip the inner overflow wrapper — use when parent
   * (e.g. ListPageCard.admin-table) is already the scrollport so sticky
   * thead / sticky-right columns keep working.
   */
  container?: boolean;
  containerClassName?: string;
};

export function Table({
  className,
  container = true,
  containerClassName,
  ...props
}: TableProps) {
  const table = (
    <table
      className={cn(
        "admin-table w-full min-w-[720px] caption-bottom text-sm",
        className,
      )}
      {...props}
    />
  );
  if (!container) return table;
  return (
    <div
      className={cn(
        "admin-table-scroll w-full overflow-x-auto",
        containerClassName,
      )}
    >
      {table}
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-4 text-left align-middle text-[12px] font-medium text-muted-foreground first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 align-middle text-sm", className)}
      {...props}
    />
  );
}
