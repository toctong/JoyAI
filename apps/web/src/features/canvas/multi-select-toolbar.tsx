"use client";

import { useMemo, useState } from "react";
import {
  CanvasIconCopy,
  CanvasIconGroup,
  CanvasIconTrash,
  CanvasIconUngroup,
} from "./icons/canvas-icons";
import { ChevronDown, LayoutGrid, Waypoints } from "lucide-react";
import type { CanvasNode } from "@joyai/shared";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import { groupIdOf, selectionBounds, type LayoutMode } from "./lib/align";
import { SELECTION_PAD, GROUP_PAD } from "./group-bounds-overlay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  /** Board chrome size for clamping the bar. */
  viewportSize?: { width: number; height: number };
};

function ToolBtn({
  title,
  danger,
  disabled,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "joy-canvas-chrome-btn grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-35",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="joy-canvas-chrome-sep mx-0.5 h-4 w-px" aria-hidden />;
}

const LAYOUT_ITEMS: {
  mode: LayoutMode;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
}[] = [
  { mode: "grid", label: "宫格布局", Icon: LayoutGrid },
  { mode: "smart", label: "智能布局", Icon: Waypoints },
];

const BAR_W = 240;
const BAR_H = 40;

export function MultiSelectToolbar({ nodes, viewport, viewportSize }: Props) {
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const layoutSelection = useCanvasStore((s) => s.layoutSelection);
  const groupSelection = useCanvasStore((s) => s.groupSelection);
  const ungroupSelection = useCanvasStore((s) => s.ungroupSelection);
  const [layoutOpen, setLayoutOpen] = useState(false);

  const bounds = useMemo(() => selectionBounds(nodes), [nodes]);

  if (nodes.length < 2 || !bounds) return null;

  const alreadyGrouped =
    nodes.every((n) => groupIdOf(n)) &&
    new Set(nodes.map((n) => groupIdOf(n)).filter(Boolean)).size === 1;

  const centerX = viewport.x + (bounds.x + bounds.w / 2) * viewport.zoom;
  const labelLift = alreadyGrouped ? GROUP_PAD + 22 : 0;
  const aboveY =
    viewport.y +
    (bounds.y - SELECTION_PAD - labelLift) * viewport.zoom -
    BAR_H -
    8;
  const hostW = viewportSize?.width ?? 1200;
  const hostH = viewportSize?.height ?? 800;
  const left = Math.min(
    Math.max(BAR_W / 2 + 8, centerX),
    Math.max(BAR_W / 2 + 8, hostW - BAR_W / 2 - 8),
  );
  const top = Math.min(Math.max(8, aboveY), Math.max(8, hostH - BAR_H - 8));

  const canLayout = nodes.length >= 2;

  function run(action: () => void) {
    pushHistory();
    action();
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-auto absolute z-[60] -translate-x-1/2"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="joy-canvas-chrome flex items-center gap-0.5 rounded-xl px-1 py-1">
        {alreadyGrouped ? (
          <ToolBtn
            title="解组 ⇧⌘G"
            onClick={() => run(() => ungroupSelection())}
          >
            <CanvasIconUngroup className="joy-canvas-tool-icon" />
          </ToolBtn>
        ) : (
          <ToolBtn title="成组 ⌘G" onClick={() => run(() => groupSelection())}>
            <CanvasIconGroup className="joy-canvas-tool-icon" />
          </ToolBtn>
        )}
        <Sep />
        <DropdownMenu open={layoutOpen} onOpenChange={setLayoutOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="布局"
              aria-label="布局"
              className="joy-canvas-chrome-btn inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium"
            >
              <LayoutGrid className="joy-canvas-tool-icon opacity-80" />
              布局
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            sideOffset={8}
            className="z-[80] min-w-[148px]"
            data-canvas-shortcuts-ignore
            onPointerDown={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {LAYOUT_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.mode}
                className="gap-2"
                disabled={!canLayout}
                onSelect={(event) => {
                  event.preventDefault();
                  if (!canLayout) return;
                  run(() => layoutSelection(item.mode));
                  setLayoutOpen(false);
                }}
              >
                <item.Icon className="joy-canvas-tool-icon opacity-80" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Sep />
        <ToolBtn
          title={`复制 ${nodes.length} 个`}
          onClick={() => run(() => duplicateNodes(nodes.map((n) => n.id)))}
        >
          <CanvasIconCopy className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn
          title={`删除 ${nodes.length} 个`}
          danger
          onClick={() => run(() => removeNodes(nodes.map((n) => n.id)))}
        >
          <CanvasIconTrash className="joy-canvas-tool-icon" />
        </ToolBtn>
      </div>
    </div>
  );
}
