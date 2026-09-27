"use client";

import { useState } from "react";
import { Compass, Sparkles, Wand2 } from "lucide-react";
import {
  CanvasIconEraser,
  CanvasIconFolder,
  CanvasIconHand,
  CanvasIconLibrary,
  CanvasIconRedo,
  CanvasIconSelect,
  CanvasIconTrash,
  CanvasIconUndo,
} from "./icons/canvas-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/lib/utils";

type Props = {
  panMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onPanModeChange: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAssets: () => void;
  onOpenSkills: () => void;
  onOpenPrompts: () => void;
  onOpenExplore: () => void;
  onDeleteSelected: () => void;
  onClearCanvas: () => void;
};

function ToolBtn({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
        active && "is-active",
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

type LibraryItem = {
  id: string;
  label: string;
  hint?: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  run: () => void;
};

/** Bottom-center dock — select / history / library / clear. */
export function CanvasToolbar({
  panMode,
  canUndo,
  canRedo,
  selectedCount,
  onPanModeChange,
  onUndo,
  onRedo,
  onOpenAssets,
  onOpenSkills,
  onOpenPrompts,
  onOpenExplore,
  onDeleteSelected,
  onClearCanvas,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  const libraryItems: LibraryItem[] = [
    {
      id: "assets",
      label: "资产库",
      hint: "历史生成与素材",
      Icon: ({ className }) => <CanvasIconFolder className={className} />,
      run: () => {
        setLibraryOpen(false);
        onOpenAssets();
      },
    },
    {
      id: "skills",
      label: "Skill 库",
      hint: "后台技能目录",
      Icon: ({ className }) => (
        <Wand2 className={className} strokeWidth={1.75} />
      ),
      run: () => {
        setLibraryOpen(false);
        onOpenSkills();
      },
    },
    {
      id: "prompts",
      label: "提示词",
      hint: "后台提示词库",
      Icon: ({ className }) => (
        <Sparkles className={className} strokeWidth={1.75} />
      ),
      run: () => {
        setLibraryOpen(false);
        onOpenPrompts();
      },
    },
    {
      id: "explore",
      label: "探索",
      hint: "一键同款到画布",
      Icon: ({ className }) => (
        <Compass className={className} strokeWidth={1.75} />
      ),
      run: () => {
        setLibraryOpen(false);
        onOpenExplore();
      },
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
      <div
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome pointer-events-auto relative flex h-11 items-center gap-0 rounded-xl px-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ToolBtn
          title={panMode ? "选中模式" : "拖动模式"}
          active
          onClick={() => onPanModeChange(!panMode)}
        >
          {panMode ? (
            <CanvasIconHand className="joy-canvas-tool-icon" />
          ) : (
            <CanvasIconSelect className="joy-canvas-tool-icon" />
          )}
        </ToolBtn>
        <ToolBtn title="撤销 ⌘Z" disabled={!canUndo} onClick={onUndo}>
          <CanvasIconUndo className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="重做 ⇧⌘Z" disabled={!canRedo} onClick={onRedo}>
          <CanvasIconRedo className="joy-canvas-tool-icon" />
        </ToolBtn>

        <Sep />

        <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="素材库"
              aria-label="素材库"
              aria-expanded={libraryOpen}
              className={cn(
                "joy-canvas-chrome-btn grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-lg transition",
                libraryOpen && "is-active",
              )}
            >
              <CanvasIconLibrary className="joy-canvas-tool-icon" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            sideOffset={12}
            className="joy-canvas-library-pop w-[220px] p-0"
            data-canvas-shortcuts-ignore
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="joy-canvas-library-pop-head">素材库</div>
            <div className="joy-canvas-library-pop-list" role="menu">
              {libraryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="joy-canvas-library-pop-item"
                  onClick={item.run}
                >
                  <span className="joy-canvas-library-pop-icon">
                    <item.Icon className="size-[18px]" />
                  </span>
                  <span className="joy-canvas-library-pop-copy">
                    <span className="joy-canvas-library-pop-label">
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className="joy-canvas-library-pop-hint">
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Sep />

        <ToolBtn
          title={selectedCount ? `删除选中 (${selectedCount})` : "删除选中"}
          danger
          disabled={!selectedCount}
          onClick={onDeleteSelected}
        >
          <CanvasIconTrash className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="清空画布" danger onClick={onClearCanvas}>
          <CanvasIconEraser className="joy-canvas-tool-icon" />
        </ToolBtn>
      </div>
    </div>
  );
}
