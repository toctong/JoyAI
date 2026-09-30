"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/shared/lib/utils";

export type { ColumnDef };

type DataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Applied to the <table> */
  className?: string;
  /** Empty body placeholder when data.length === 0 */
  empty?: React.ReactNode;
  getRowId?: (originalRow: TData, index: number) => string;
  onRowClick?: (row: Row<TData>) => void;
};

/**
 * TanStack Table v8 + shadcn Table.
 * Wrap with `<ListPageCard className="admin-table">` so sticky header /
 * sticky-right actions share one overflow scrollport.
 */
export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  className,
  empty,
  getRowId,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  return (
    <Table container={false} className={cn("min-w-[1100px]", className)}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta;
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    meta?.stickyRight && "admin-col-sticky-right text-right",
                    meta?.className,
                  )}
                  style={{
                    width:
                      header.getSize() !== 150 ? header.getSize() : undefined,
                    minWidth:
                      header.column.columnDef.minSize ??
                      (header.getSize() !== 150
                        ? header.getSize()
                        : undefined),
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      meta?.stickyRight && "admin-col-sticky-right",
                      meta?.cellClassName,
                    )}
                    onClick={
                      meta?.stickyRight
                        ? (e) => e.stopPropagation()
                        : undefined
                    }
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-28 text-center text-muted-foreground"
            >
              {empty ?? "暂无数据"}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
