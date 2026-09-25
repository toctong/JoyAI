"use client";

import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import {
  type WorkspaceMode,
  workspaceListHref,
  writeWorkspaceMode,
} from "./workspace-nav";

const TABS: { id: WorkspaceMode; label: string }[] = [
  { id: "canvas", label: "画布" },
  { id: "manju", label: "漫剧" },
];

type Props = {
  active: WorkspaceMode;
  className?: string;
};

/** List-page switcher between canvas library and manju library. */
export function WorkspaceModeTabs({ active, className }: Props) {
  return (
    <div
      className={cn("joy-workspace-tabs", className)}
      role="tablist"
      aria-label="项目类型"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={workspaceListHref(tab.id)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "joy-workspace-tabs__item",
              isActive && "is-active",
            )}
            onClick={() => writeWorkspaceMode(tab.id)}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
