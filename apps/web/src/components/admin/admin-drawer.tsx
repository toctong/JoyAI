"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Right drawer for admin create/edit forms (manju-aligned chrome).
 */
export function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  /** Wide enough for capability chips / dual columns */
  widthClassName = "sm:max-w-[720px]",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** e.g. sm:max-w-[640px] / sm:max-w-[840px] */
  widthClassName?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "joy-admin-drawer w-full gap-0 p-0",
          widthClassName,
          className,
        )}
      >
        <div className="joy-admin-drawer-header pr-12">
          <SheetTitle className="joy-admin-drawer-title">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="joy-admin-drawer-desc">
              {description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </div>
        <div className="joy-admin-drawer-body">{children}</div>
        {footer ? (
          <div className="joy-admin-drawer-footer">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
