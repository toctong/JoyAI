"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/shared/lib/api";
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

/** 漫剧工作台底部：选渠道模型（活着的组件；旧 StudioShell 已移除） */
export function ManjuModelBar({ project }: { project: ManjuProjectDraft }) {
  const patchSettings = useManjuStore((s) => s.patchSettings);
  const groups = useChannelModels();
  const rows = [
    { key: "llmModelId" as const, label: "文本", items: groups.llm },
    { key: "imageModelId" as const, label: "图像", items: groups.image },
    { key: "videoModelId" as const, label: "视频", items: groups.video },
  ];

  return (
    <div className="manju-card">
      <div className="manju-card__title">渠道模型</div>
      <p className="manju-card__desc mb-3">
        只使用管理后台已启用的渠道模型，不直连供应商。
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((row) => {
          const value = project.settings[row.key]?.trim() || AUTO;
          return (
            <div key={row.key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{row.label}</Label>
              <Select
                value={value}
                onValueChange={(next) =>
                  patchSettings(project.id, {
                    [row.key]: next === AUTO ? "" : next,
                  })
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="渠道默认" />
                </SelectTrigger>
                <SelectContent>
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
      {groups.llm.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          没有可用的文本模型。请在管理后台启用 kind=llm 的模型后再跑技能。
        </p>
      ) : null}
    </div>
  );
}
