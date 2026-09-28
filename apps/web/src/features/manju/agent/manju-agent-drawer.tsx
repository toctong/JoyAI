"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import { ScriptAiPanel } from "../script-ai/script-ai-panel";
import { useManjuStore } from "../manju-store";
import { ManjuAgentPanel } from "./manju-agent-panel";

const WIDTH_KEY = "manju-agent-drawer-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;

function readWidth() {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= MIN_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

function writeWidth(w: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
  } catch {
    /* ignore */
  }
}

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Tab = "agent" | "script";

export function ManjuAgentDrawer({
  projectId,
  open,
  onOpenChange,
}: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [tab, setTab] = useState<Tab>("agent");
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  useEffect(() => {
    setWidth(readWidth());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const max = Math.max(
        MIN_WIDTH,
        Math.min(window.innerWidth * 0.72, 720),
      );
      const next = Math.min(
        max,
        Math.max(MIN_WIDTH, drag.startWidth + (drag.startX - event.clientX)),
      );
      setWidth(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidth((w) => {
        writeWidth(w);
        return w;
      });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open]);

  const applyScript = useCallback(
    (script: string) => {
      updateProject(projectId, { scriptText: script });
    },
    [projectId, updateProject],
  );

  if (!open) {
    return (
      <button
        type="button"
        className="manju-agent-fab"
        onClick={() => onOpenChange(true)}
        title="与 AI 对话"
        aria-label="与 AI 对话"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOYAI_BRAND.logo}
          alt=""
          className="size-4 object-contain"
          draggable={false}
        />
        与 AI 对话
      </button>
    );
  }

  return (
    <aside
      className={cn("manju-studio__agent")}
      style={{ width }}
      aria-label="漫剧 Agent"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整宽度"
        title="拖动调整宽度"
        className="manju-studio__agent-resize"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = {
            startX: event.clientX,
            startWidth: width,
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 pl-4">
        <div className="inline-flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={JOYAI_BRAND.logo}
            alt=""
            className="size-4 shrink-0 object-contain"
            draggable={false}
          />
          <div className="manju-agent-tabs">
            <button
              type="button"
              className={cn(tab === "agent" && "is-active")}
              onClick={() => setTab("agent")}
            >
              Agent
            </button>
            <button
              type="button"
              className={cn(tab === "script" && "is-active")}
              onClick={() => setTab("script")}
            >
              剧本帮写
            </button>
          </div>
        </div>
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
          className="manju-chrome-btn manju-chrome-btn--icon"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!project ? (
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
            Agent 加载中…
          </div>
        ) : tab === "agent" ? (
          <ManjuAgentPanel projectId={projectId} compactHeader />
        ) : (
          <ScriptAiPanel
            projectId={projectId}
            modelId={project.settings.llmModelId || undefined}
            scriptText={project.scriptText}
            onApplyScript={applyScript}
            onCollapse={() => onOpenChange(false)}
          />
        )}
      </div>
    </aside>
  );
}
