"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Cpu } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "./manju-store";
import type { ManjuProjectDraft } from "./manju-types";

type ChannelModel = {
  id: string;
  name: string;
  kind: string;
  channel?: { name?: string };
};

const AUTO = "__auto__";

export function useChannelModels() {
  const [models, setModels] = useState<ChannelModel[]>([]);
  useEffect(() => {
    void api<ChannelModel[]>("/models")
      .then(setModels)
      .catch(() => setModels([]));
  }, []);
  return useMemo(
    () => ({
      llm: models.filter((m) => m.kind === "llm"),
      image: models.filter((m) => m.kind === "image"),
      video: models.filter((m) => m.kind === "video"),
    }),
    [models],
  );
}

function shortName(name: string, max = 10) {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 漫剧项目全局渠道模型：头部收纳为下拉面板 */
export function ManjuModelBar({
  project,
  className,
}: {
  project: ManjuProjectDraft;
  className?: string;
}) {
  const patchSettings = useManjuStore((s) => s.patchSettings);
  const groups = useChannelModels();
  const [open, setOpen] = useState(false);

  const rows = [
    { key: "llmModelId" as const, label: "文本", items: groups.llm },
    { key: "imageModelId" as const, label: "图像", items: groups.image },
    { key: "videoModelId" as const, label: "视频", items: groups.video },
  ];

  const summaryParts = rows.map((row) => {
    const id = project.settings[row.key]?.trim();
    if (!id) return `${row.label}自动`;
    const m = row.items.find((item) => item.id === id);
    return `${row.label}${shortName(m?.name ?? "已选", 10)}`;
  });
  const summary = summaryParts.join(" · ");

  const customCount = rows.filter((row) =>
    Boolean(project.settings[row.key]?.trim()),
  ).length;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "manju-model-bar-trigger",
            open && "manju-model-bar-trigger--open",
            className,
          )}
          title={`渠道模型：${summary}`}
          aria-label="渠道模型"
        >
          <Cpu className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="manju-model-bar-trigger__label">模型</span>
          <span className="manju-model-bar-trigger__summary">
            {customCount === 0 ? "渠道默认" : `已选 ${customCount}`}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 opacity-50 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="manju-model-bar-panel w-[300px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const el = e.target as HTMLElement | null;
          if (
            el?.closest(
              "[data-radix-select-content], [data-radix-popper-content-wrapper]",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <div className="manju-model-bar-panel__head">
          <strong>渠道模型</strong>
          <p>只使用管理后台已启用的模型，本项目全局生效</p>
        </div>
        <div className="manju-model-bar-panel__body">
          {rows.map((row) => {
            const value = project.settings[row.key]?.trim() || AUTO;
            return (
              <div key={row.key} className="manju-model-bar-panel__row">
                <span className="manju-model-bar-panel__kind">{row.label}</span>
                <Select
                  value={value}
                  onValueChange={(next) =>
                    patchSettings(project.id, {
                      [row.key]: next === AUTO ? "" : next,
                    })
                  }
                >
                  <SelectTrigger className="manju-model-bar-panel__select">
                    <SelectValue placeholder="自动" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[80]">
                    <SelectItem value={AUTO}>自动（渠道默认）</SelectItem>
                    {row.items.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        {m.channel?.name ? ` · ${m.channel.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
