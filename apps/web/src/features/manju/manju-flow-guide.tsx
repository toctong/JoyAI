"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ManjuFlowGuide } from "./lib/flow-guide";

/** 内容区顶部：本步该点什么（轻量提示行，不抢主内容） */
export function ManjuFlowGuideBar({
  guide,
  onCta,
  className,
}: {
  guide: ManjuFlowGuide;
  onCta: () => void;
  className?: string;
}) {
  const quiet = guide.intent === "noop";

  return (
    <div
      className={cn(
        "manju-flow-guide",
        guide.readyForNext && "manju-flow-guide--ready",
        className,
      )}
    >
      <p className="manju-flow-guide__copy">
        <span className="manju-flow-guide__title">{guide.title}</span>
        <span className="manju-flow-guide__detail">{guide.detail}</span>
      </p>
      {quiet ? null : (
        <button
          type="button"
          className="manju-flow-guide__cta"
          onClick={onCta}
        >
          <span>{guide.cta}</span>
          <ArrowRight className="size-3 opacity-70" aria-hidden />
        </button>
      )}
    </div>
  );
}
