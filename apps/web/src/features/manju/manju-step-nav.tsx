"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  MANJU_STEPS,
  type ManjuStepId,
} from "./config/manju-steps";
import {
  getWorkflowNextAction,
  type ManjuProjectDraft,
} from "./manju-types";

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
        className="manju-nav__title-input"
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
      className="manju-nav__title"
      onClick={() => setEditing(true)}
      title="点击编辑项目名称"
    >
      {value}
    </button>
  );
}

export function ManjuStepNav({
  project,
  currentId,
  completed,
  onProjectTitleChange,
  onSelect,
  onSuggested,
}: {
  project: ManjuProjectDraft;
  currentId: ManjuStepId;
  completed: Set<ManjuStepId>;
  onProjectTitleChange: (title: string) => void;
  onSelect: (id: ManjuStepId) => void;
  onSuggested?: () => void;
}) {
  const nextAction = useMemo(
    () => getWorkflowNextAction(project),
    [project],
  );

  return (
    <aside className="manju-nav">
      <div className="manju-nav__head">
        <Link href="/manju" className="manju-nav__back" title="全部项目">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Link>
        <EditableTitle
          value={project.title}
          onChange={onProjectTitleChange}
        />
      </div>

      <ol className="manju-nav__steps">
        {MANJU_STEPS.map((step, i) => {
          const active = step.id === currentId;
          const done = completed.has(step.id) || active;
          const isLast = i === MANJU_STEPS.length - 1;

          return (
            <li
              key={step.id}
              className={cn(
                "manju-nav__step-wrap",
                active && "manju-nav__step-wrap--active",
              )}
            >
              <button
                type="button"
                className={cn(
                  "manju-nav__step",
                  active && "manju-nav__step--active",
                  done && !active && "manju-nav__step--done",
                )}
                onClick={() => onSelect(step.id)}
              >
                <span
                  className={cn(
                    "manju-nav__step-index",
                    active && "manju-nav__step-index--active",
                  )}
                >
                  {step.index}
                </span>
                <span className="manju-nav__step-label">{step.label}</span>
                <span
                  className={cn(
                    "manju-nav__step-check",
                    !done && "manju-nav__step-check--empty",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                </span>
              </button>
              {!isLast ? (
                <div className="manju-nav__connector-row" aria-hidden>
                  <span className="manju-nav__connector" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="manju-nav__footer">
        <div className="manju-nav__next-label">建议下一步</div>
        <button
          type="button"
          className="manju-nav__next-text w-full text-left hover:underline"
          onClick={() => {
            if (onSuggested) onSuggested();
            else onSelect(nextAction.stepId);
          }}
        >
          <span className="font-medium">{nextAction.label}</span>
          <span className="mt-0.5 block text-muted-foreground">
            {nextAction.detail}
          </span>
        </button>
      </div>
    </aside>
  );
}
