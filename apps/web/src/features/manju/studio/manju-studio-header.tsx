"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ManjuProjectDraft } from "../manju-types";

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
  saving: boolean;
  analyzing: boolean;
  onTitleChange: (title: string) => void;
};

/** Slim studio header — title + status only. */
export function ManjuStudioHeader({
  project,
  saving,
  analyzing,
  onTitleChange,
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
      <div className="manju-studio-header__spacer" />
      <span
        className={cn(
          "manju-studio-header__status",
          saving && "is-saving",
          analyzing && "is-busy",
        )}
      >
        {analyzing ? "解析中…" : saving ? "保存中…" : null}
      </span>
    </header>
  );
}
