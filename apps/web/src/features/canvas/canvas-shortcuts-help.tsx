"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasIconClose,
  CanvasIconCopy,
  CanvasIconFit,
  CanvasIconFolderPlus,
  CanvasIconGroup,
  CanvasIconHand,
  CanvasIconLink,
  CanvasIconPlus,
  CanvasIconSnap,
  CanvasIconTrash,
  CanvasIconUndo,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

type SectionId = "shortcuts" | "basics" | "nav" | "advanced";

const NAV: { id: SectionId; label: string }[] = [
  { id: "shortcuts", label: "快捷键" },
  { id: "basics", label: "基础操作" },
  { id: "nav", label: "画布导航" },
  { id: "advanced", label: "高级功能" },
];

type Shortcut = { label: string; keys: string[] };

type GuideCard = {
  title: string;
  desc: string;
  Icon: (p: { className?: string }) => React.ReactNode;
};

function useModSymbol() {
  return useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  }, []);
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border/70 bg-background/50 px-1 text-[11px] font-medium leading-none text-foreground/90">
      {children}
    </kbd>
  );
}

function ShortcutTile({ label, keys }: Shortcut) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-lg bg-muted/55 px-2.5">
      <span className="min-w-0 truncate text-[12px] text-foreground/90">
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {keys.map((key, i) => (
          <KeyCap key={`${key}-${i}`}>{key}</KeyCap>
        ))}
      </span>
    </div>
  );
}

function GuideCardTile({ title, desc, Icon }: GuideCard) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-background/60 text-foreground/80">
          <Icon className="size-3.5" />
        </span>
        <span className="text-[13px] font-medium text-foreground">{title}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CanvasShortcutsHelp({ open, onClose }: Props) {
  const mod = useModSymbol();
  const [active, setActive] = useState<SectionId>("shortcuts");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>(
    {},
  );

  const shortcuts: Shortcut[] = useMemo(
    () => [
      { label: "复制节点", keys: [mod, "C"] },
      { label: "粘贴", keys: [mod, "V"] },
      { label: "创建副本", keys: [mod, "D"] },
      { label: "全选", keys: [mod, "A"] },
      { label: "撤销", keys: [mod, "Z"] },
      { label: "重做", keys: ["⇧", mod, "Z"] },
      { label: "成组", keys: [mod, "G"] },
      { label: "解组", keys: ["⇧", mod, "G"] },
      { label: "删除", keys: ["⌫"] },
      { label: "临时拖动画布", keys: ["Space"] },
      { label: "放大", keys: [mod, "+"] },
      { label: "缩小", keys: [mod, "−"] },
      { label: "适应内容", keys: ["0"] },
      { label: "适应（防浏览器缩放）", keys: [mod, "0"] },
      { label: "适应选中", keys: ["1"] },
      { label: "打开本指南", keys: ["?"] },
      { label: "取消选中", keys: ["Esc"] },
      { label: "微调选中", keys: ["↑", "↓", "←", "→"] },
      { label: "加选 / 减选", keys: ["⇧", "点击"] },
      { label: "单独移出编组", keys: ["Alt", "拖动"] },
    ],
    [mod],
  );

  const basics: GuideCard[] = [
    {
      title: "添加节点",
      desc: "右键或双击空白，或用左侧工具栏创建文本 / 图片 / 视频等节点。",
      Icon: CanvasIconPlus,
    },
    {
      title: "删除节点",
      desc: "选中后按 Delete / Backspace，或用底栏删除与清空。",
      Icon: CanvasIconTrash,
    },
    {
      title: "复制粘贴",
      desc: "⌘/Ctrl C 复制选中节点，V 粘贴；也可粘贴剪贴板图片与文本。",
      Icon: CanvasIconCopy,
    },
    {
      title: "撤销重做",
      desc: "⌘/Ctrl Z 撤销，⇧⌘/Ctrl Z 重做，支持连续历史。",
      Icon: CanvasIconUndo,
    },
    {
      title: "成组",
      desc: "多选后 ⌘/Ctrl G 成组；⇧⌘/Ctrl G 解组。",
      Icon: CanvasIconGroup,
    },
    {
      title: "从资产添加",
      desc: "底栏素材库 → 资产库，或左侧资产入口，把素材插入画布。",
      Icon: CanvasIconFolderPlus,
    },
  ];

  const navCards: GuideCard[] = [
    {
      title: "缩放画布",
      desc: "对准光标滚轮缩放；⌘/Ctrl + − 放大缩小；⌘/Ctrl 0 适应全部。",
      Icon: CanvasIconZoomIn,
    },
    {
      title: "平移画布",
      desc: "按住 Space 拖动，或中键拖动；也可切换底栏拖动模式。",
      Icon: CanvasIconHand,
    },
    {
      title: "适应内容",
      desc: "按 0 或底栏适应按钮框住全部节点；1 适应当前选中。",
      Icon: CanvasIconFit,
    },
    {
      title: "隐藏连线",
      desc: "开启后仅选中或悬停节点时显示相关连线，并播放流动画。",
      Icon: CanvasIconLink,
    },
  ];

  const advanced: GuideCard[] = [
    {
      title: "框选与多选",
      desc: "空白处拖出选框；⇧ 点击加减选；多选后可成组、对齐、批量连线。",
      Icon: CanvasIconGroup,
    },
    {
      title: "对齐线",
      desc: "拖动节点时自动对齐边与中线并显示参考线；按住 ⌃/⌘ 可暂时关闭。",
      Icon: CanvasIconSnap,
    },
    {
      title: "连线",
      desc: "从节点左右绿点拖线；多选时用选区右侧绿点批量连到目标。",
      Icon: CanvasIconLink,
    },
    {
      title: "颜色标签",
      desc: "节点标题旁上色；顶栏色点可聚焦同色节点。",
      Icon: CanvasIconPlus,
    },
    {
      title: "拖入文件",
      desc: "把图片 / 视频 / 音频拖进画布即可上传并生成节点。",
      Icon: CanvasIconFolderPlus,
    },
  ];

  useEffect(() => {
    if (!open) return;
    setActive("shortcuts");
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = scrollerRef.current;
    if (!root) return;
    const observers: IntersectionObserver[] = [];
    for (const item of NAV) {
      const el = sectionRefs.current[item.id];
      if (!el) continue;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) setActive(item.id);
        },
        { root, rootMargin: "-20% 0px -65% 0px", threshold: 0 },
      );
      io.observe(el);
      observers.push(io);
    }
    return () => observers.forEach((io) => io.disconnect());
  }, [open]);

  function scrollTo(id: SectionId) {
    setActive(id);
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/45" />
        <DialogPrimitive.Content
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[min(86vh,720px)] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DialogDescription className="sr-only">
            画布使用指南：快捷键与基础操作说明
          </DialogDescription>

          <aside className="flex w-[148px] shrink-0 flex-col border-r border-border/70 bg-muted/25 p-3 pt-4">
            <DialogTitle className="mb-4 px-2 text-[14px] font-medium tracking-tight">
              画布使用指南
            </DialogTitle>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                    active === item.id
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col">
            <DialogPrimitive.Close className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <CanvasIconClose className="size-4" />
              <span className="sr-only">关闭</span>
            </DialogPrimitive.Close>

            <div
              ref={scrollerRef}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pr-6"
            >
              <section
                ref={(el) => {
                  sectionRefs.current.shortcuts = el;
                }}
                className="mb-8"
              >
                <h3 className="mb-3 text-[13px] font-medium text-foreground">
                  快捷键
                </h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {shortcuts.map((item) => (
                    <ShortcutTile
                      key={`${item.label}-${item.keys.join("-")}`}
                      {...item}
                    />
                  ))}
                </div>
              </section>

              <section
                ref={(el) => {
                  sectionRefs.current.basics = el;
                }}
                className="mb-8"
              >
                <h3 className="mb-3 text-[13px] font-medium text-foreground">
                  基础操作
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {basics.map((card) => (
                    <GuideCardTile key={card.title} {...card} />
                  ))}
                </div>
              </section>

              <section
                ref={(el) => {
                  sectionRefs.current.nav = el;
                }}
                className="mb-8"
              >
                <h3 className="mb-3 text-[13px] font-medium text-foreground">
                  画布导航
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {navCards.map((card) => (
                    <GuideCardTile key={card.title} {...card} />
                  ))}
                </div>
              </section>

              <section
                ref={(el) => {
                  sectionRefs.current.advanced = el;
                }}
                className="mb-2"
              >
                <h3 className="mb-3 text-[13px] font-medium text-foreground">
                  高级功能
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {advanced.map((card) => (
                    <GuideCardTile key={card.title} {...card} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
