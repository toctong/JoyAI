"use client";

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
import { buttonVariants } from "@/components/ui/button";
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? "确认"}</AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription>
              {options.description}
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">
              请确认是否继续
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={(e) => {
              e.preventDefault();
              settle(false);
            }}
          >
            {options?.cancelText ?? "取消"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              options?.destructive &&
                buttonVariants({ variant: "destructive" }),
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
