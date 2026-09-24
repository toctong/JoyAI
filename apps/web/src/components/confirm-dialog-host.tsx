"use client";

import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";
import { useConfirmStore } from "@/shared/lib/confirm";

export function ConfirmDialogHost() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && useConfirmStore.getState().open) {
          settle(false);
        }
      }}
    >
      <AlertDialogContent
        className={cn(
          "joy-confirm-dialog gap-5 border-0 bg-card p-6 shadow-[0_24px_64px_-28px_rgba(15,23,42,0.35)]",
          "max-w-[400px] rounded-[20px] sm:rounded-[20px]",
          "dark:shadow-[0_28px_70px_-22px_rgba(0,0,0,0.7)]",
        )}
      >
        <AlertDialogCancel
          className={cn(
            "absolute right-4 top-4 h-8 w-8 rounded-full border-0 bg-transparent p-0",
            "text-foreground shadow-none",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="关闭"
          onClick={(e) => {
            e.preventDefault();
            settle(false);
          }}
        >
          <X className="size-4" strokeWidth={2} />
        </AlertDialogCancel>

        <AlertDialogHeader className="space-y-3 pr-8 text-left sm:text-left">
          <AlertDialogTitle className="text-[17px] font-semibold leading-snug tracking-tight text-foreground">
            {options?.title ?? "确认"}
          </AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription className="text-[length:var(--joy-font-label)] leading-relaxed text-muted-foreground">
              {options.description}
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">
              请确认是否继续
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2.5 sm:justify-end">
          <AlertDialogCancel
            className={cn(
              "h-10 min-w-[72px] rounded-xl border-0 bg-secondary px-5",
              "text-[length:var(--joy-font-label)] font-medium text-foreground shadow-none",
              "hover:bg-secondary/80 hover:text-foreground",
            )}
            onClick={(e) => {
              e.preventDefault();
              settle(false);
            }}
          >
            {options?.cancelText ?? "取消"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "h-10 min-w-[72px] rounded-xl border-0 px-5 shadow-none",
              "text-[length:var(--joy-font-label)] font-medium",
              options?.destructive
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            onClick={(e) => {
              e.preventDefault();
              settle(true);
            }}
          >
            {options?.confirmText ?? "确定"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
