"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Clapperboard,
  ImageIcon,
  LayoutDashboard,
  MapPin,
  Package,
  PenLine,
  Play,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { submitManjuAnalyzeJob } from "./manju-api";
import { useManjuStore } from "./manju-store";
import {
  getWorkflowNextAction,
  type ManjuPanel,
  type ManjuProjectDraft,
} from "./manju-types";

type ChannelModel = {
  id: string;
  name: string;
  kind: string;
  channel?: { name?: string };
};

const NAV: { id: ManjuPanel; label: string; icon: typeof UserRound }[] = [
  { id: "overview", label: "项目概览", icon: LayoutDashboard },
  { id: "characters", label: "角色", icon: UserRound },
  { id: "scenes", label: "场景", icon: MapPin },
  { id: "props", label: "道具", icon: Package },
  { id: "timeline", label: "分镜时间线", icon: Clapperboard },
  { id: "prompts", label: "提示词", icon: PenLine },
  { id: "preview", label: "预览", icon: Play },
];

const PHASES = ["准备", "脚本", "制作", "完成"] as const;
const AUTO = "__auto__";

function phaseIndex(panel: ManjuPanel, project: ManjuProjectDraft): number {
  if (panel === "preview" || project.shots.some((s) => s.videoUrl)) return 3;
  if (
    panel === "prompts" ||
    project.shots.some((s) => s.storyboardImageUrl || s.imagePrompt)
  )
    return 2;
  if (project.shots.length > 0 || project.scriptConfirmed) return 1;
  return 0;
}

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

export function ManjuStudioShell({
  project,
  panel,
  episodeId = null,
  saving,
  onPanel,
  onEpisode,
  onTitle,
  children,
}: {
  project: ManjuProjectDraft;
  panel: ManjuPanel;
  episodeId?: string | null;
  saving: boolean;
  onPanel: (panel: ManjuPanel) => void;
  onEpisode?: (episodeId: string | null) => void;
  onTitle: (title: string) => void;
  children: ReactNode;
}) {
  const next = useMemo(() => getWorkflowNextAction(project), [project]);
  const phase = phaseIndex(panel, project);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const updateProject = useManjuStore((s) => s.updateProject);
  const flushSave = useManjuStore((s) => s.flushSave);

  const runSkill = async () => {
    if (!next.skill) {
      onPanel(next.panel);
      return;
    }
    if (!project.settings.llmModelId && next.skill) {
      toast.message("未指定文本模型时将使用渠道里最新的 LLM");
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      const names = project.assets.map((a) => a.name).join("、");
      const shotBrief = (episodeId
        ? project.shots.filter((s) => s.episodeId === episodeId)
        : project.shots
      )
        .map((s) => {
          const assetNames = project.assets
            .filter((a) => s.assetRefs.includes(a.id))
            .map((a) => a.name)
            .join("、");
          return `#${s.index} 画面:${s.visual} 对白:${s.dialogue || "无"} 资产:${assetNames || "无"}`;
        })
        .join("\n");
      const episodes = project.episodes.map((e) => e.title).join("、");
      const prompt =
        next.skill === "analyze_assets"
          ? project.scriptText
          : next.skill === "script_plan"
            ? `可用资产：${names || "（暂无）"}\n分集标题：${episodes || "（未分集）"}\n\n原文：\n${project.scriptText}`
            : `风格：${project.settings.style}\n画幅：${project.settings.ratio}\n说明：每条镜头的序号必须使用下列全局 #index，不要从 1 重新编号。\n\n已锁定镜头：\n${shotBrief}`;
      await submitManjuAnalyzeJob({
        projectId: project.id,
        scriptText: prompt,
        purpose: next.skill,
        modelId: project.settings.llmModelId,
      });
      toast.success("已提交技能任务");
      onPanel(next.panel);
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  return (
    <div className="manju-studio">
      <header className="manju-studio__header">
        <Link href="/manju" className="manju-studio__back">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <input
          className="manju-studio__title"
          value={project.title}
          onChange={(e) => onTitle(e.target.value)}
          aria-label="项目名称"
        />
        <ol className="manju-studio__phases">
          {PHASES.map((label, i) => (
            <li
              key={label}
              className={cn(
                "manju-studio__phase",
                i === phase && "is-active",
                i < phase && "is-done",
              )}
            >
              {label}
            </li>
          ))}
        </ol>
        <span className="manju-studio__save">
          {saving ? "保存中…" : "已同步"}
        </span>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="manju-studio__body min-h-0 flex-1"
      >
        <ResizablePanel defaultSize="18" minSize="12" maxSize="28">
          <ScrollArea className="h-full" type="hover">
            <aside className="manju-studio__side !w-full !border-0">
              {NAV.map((item) => {
                const Icon = item.icon;
                const count =
                  item.id === "characters"
                    ? project.assets.filter((a) => a.kind === "character")
                        .length
                    : item.id === "scenes"
                      ? project.assets.filter((a) => a.kind === "scene").length
                      : item.id === "props"
                        ? project.assets.filter((a) => a.kind === "prop")
                            .length
                        : item.id === "timeline"
                          ? project.shots.length
                          : item.id === "prompts"
                            ? project.shots.filter(
                                (s) =>
                                  s.imagePrompt?.trim() &&
                                  s.videoPrompt?.trim(),
                              ).length
                            : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "manju-studio__nav",
                      panel === item.id && "is-active",
                    )}
                    onClick={() => onPanel(item.id)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {count != null ? (
                      <span className="ml-auto text-[11px] opacity-60">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {project.episodes.length > 0 ? (
                <div className="manju-studio__episodes">
                  <div className="manju-studio__episodes-label">分集</div>
                  <button
                    type="button"
                    className={cn(
                      "manju-studio__episode",
                      panel === "timeline" && !episodeId && "is-active",
                    )}
                    onClick={() => onEpisode?.(null)}
                  >
                    全部镜头
                  </button>
                  {project.episodes.map((ep, i) => (
                    <button
                      key={ep.id}
                      type="button"
                      className={cn(
                        "manju-studio__episode",
                        panel === "timeline" &&
                          episodeId === ep.id &&
                          "is-active",
                      )}
                      onClick={() => onEpisode?.(ep.id)}
                    >
                      {String(i + 1).padStart(2, "0")} {ep.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </aside>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle className="manju-studio__resize" />

        <ResizablePanel defaultSize="58" minSize="40">
          <ScrollArea className="h-full" type="hover">
            <main className="manju-studio__main">{children}</main>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle className="manju-studio__resize" />

        <ResizablePanel defaultSize="24" minSize="16" maxSize="36">
          <ScrollArea className="h-full" type="hover">
            <aside className="manju-studio__copilot !w-full !border-0">
              <div className="manju-studio__copilot-title">
                <Sparkles className="h-4 w-4" />
                技能助手
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                按 ArcReel drama 顺序：分析资产 → 锁定分镜 → 确认 → 写提示词（@[名]）→
                渠道生图/生视频。生图会拼「图N」参考与 Avoid；角色设定默认三视图。不含
                ComfyUI 与成片合成。
              </p>
              <div className="manju-card !p-3">
                <div className="text-sm font-medium">{next.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {next.detail}
                </p>
              </div>
              <Button
                size="sm"
                disabled={analyzing}
                onClick={() => void runSkill()}
              >
                {analyzing
                  ? "执行中…"
                  : next.skill
                    ? `运行 ${next.skill}`
                    : "前往这一步"}
              </Button>
              {project.shots.length > 0 && !project.scriptConfirmed ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    updateProject(project.id, { scriptConfirmed: true });
                    const needAssets = !project.assets.some((a) => a.imageUrl);
                    toast.success(
                      needAssets
                        ? "脚本已确认，请先生成设定图"
                        : "脚本已确认，可以写提示词",
                    );
                    onPanel(needAssets ? "characters" : "prompts");
                  }}
                >
                  确认脚本
                </Button>
              ) : null}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                图像 {project.settings.imageModelId ? "已指定" : "渠道默认"} ·
                视频 {project.settings.videoModelId ? "已指定" : "渠道默认"}
              </div>
            </aside>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
