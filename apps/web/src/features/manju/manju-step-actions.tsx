"use client";

import { Loader2, Plus } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ManjuGenerateCombo } from "./manju-generate-combo";
import type {
  ManjuHeaderGenerateAction,
  ManjuHeaderTools,
} from "./manju-header-slots";

/** 步骤内操作栏（内容区），不进顶栏 */
export function ManjuStepActions({
  tools,
  generate,
  busy,
  className,
}: {
  tools?: ManjuHeaderTools | null;
  generate?: ManjuHeaderGenerateAction | null;
  busy?: boolean;
  className?: string;
}) {
  if (!tools && !generate) return null;

  return (
    <div className={cn("manju-step-actions", className)}>
      {tools ? (
        <div className="manju-step-actions__tools">
          <button
            type="button"
            className="manju-step-actions__btn"
            disabled={tools.add.disabled || tools.add.loading || busy}
            title={tools.add.title}
            onClick={tools.add.onClick}
          >
            {tools.add.loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            <span>{tools.add.label}</span>
          </button>
          {tools.secondary ? (
            <button
              type="button"
              className={cn(
                "manju-step-actions__btn",
                tools.secondary.label.includes("停止") &&
                  "manju-step-actions__btn--stop",
                tools.secondary.emphasis && "manju-step-actions__btn--emphasis",
              )}
              data-manju-focus={tools.secondary.focus}
              disabled={tools.secondary.disabled || tools.secondary.loading}
              title={tools.secondary.title}
              onClick={tools.secondary.onClick}
            >
              {tools.secondary.loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              <span>{tools.secondary.label}</span>
            </button>
          ) : null}
          {tools.tertiary ? (
            <button
              type="button"
              className={cn(
                "manju-step-actions__btn",
                tools.tertiary.emphasis && "manju-step-actions__btn--emphasis",
              )}
              data-manju-focus={tools.tertiary.focus}
              disabled={
                tools.tertiary.disabled || tools.tertiary.loading || busy
              }
              title={tools.tertiary.title}
              onClick={tools.tertiary.onClick}
            >
              {tools.tertiary.loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              <span>{tools.tertiary.label}</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div />
      )}
      {generate ? (
        <ManjuGenerateCombo
          label={generate.label}
          onPrimary={generate.onPrimary}
          disabled={generate.disabled || busy}
          primaryDisabled={generate.primaryDisabled}
          loading={generate.loading}
          emphasis={generate.emphasis}
          title={generate.title}
        />
      ) : null}
    </div>
  );
}
