"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ManjuExportDialog } from "./manju-export-dialog";
import type { ManjuProjectDraft } from "../manju-types";
import {
  MANJU_PHASES,
  type ManjuPhase,
} from "./manju-studio-routes";

const DEFAULT_TITLE = "未命名漫剧";

function EditableTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    onChange(draft.trim() || DEFAULT_TITLE);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="manju-studio-header__title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label="项目名称"
        maxLength={48}
      />
    );
  }

  return (
    <button
      type="button"
      className="manju-studio-header__title"
      onClick={() => setEditing(true)}
      title="点击编辑项目名称"
    >
      {value}
    </button>
  );
}

type Props = {
  project: ManjuProjectDraft;
  projectId: string;
  phase: ManjuPhase;
  saving: boolean;
  analyzing: boolean;
  onTitleChange: (title: string) => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
  children?: ReactNode;
};

export function ManjuStudioHeader({
  project,
  phase,
  saving,
  analyzing,
  onTitleChange,
  agentOpen,
  onToggleAgent,
  children,
}: Props) {
  return (
    <header className="manju-studio__header">
      <Link
        href="/manju"
        className="manju-studio-header__back"
        title="返回项目列表"
        aria-label="返回项目列表"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <EditableTitle value={project.title} onChange={onTitleChange} />
      <div className="manju-studio-header__phases" role="list">
        {MANJU_PHASES.map((p) => (
          <span
            key={p.id}
            role="listitem"
            className={cn(
              "manju-studio-header__phase",
              phase === p.id && "is-active",
            )}
          >
            {p.label}
          </span>
        ))}
      </div>
      <div className="manju-studio-header__toolbar">{children}</div>
      <div className="manju-studio-header__spacer" />
      <span
        className={cn(
          "manju-studio-header__status",
          saving && "is-saving",
          analyzing && "is-busy",
        )}
      >
        {analyzing ? "处理中…" : saving ? "保存中…" : "已保存"}
      </span>
      <div className="manju-studio-header__actions">
        <ManjuExportDialog
          project={project}
          trigger={
            <button
              type="button"
              className="manju-chrome-btn manju-chrome-btn--icon"
              title="导出"
              aria-label="导出"
            >
              <Download className="size-3.5" />
            </button>
          }
        />
        <button
          type="button"
          className={cn(
            "manju-chrome-btn",
            agentOpen && "is-active",
          )}
          onClick={onToggleAgent}
          title={agentOpen ? "关闭 Agent" : "打开 Agent"}
          aria-pressed={agentOpen}
        >
          <Sparkles className="size-3.5" />
          <span>Agent</span>
        </button>
      </div>
    </header>
  );
}
