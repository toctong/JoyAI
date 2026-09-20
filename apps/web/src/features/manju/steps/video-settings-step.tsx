"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ManjuVideoSettingsSchema } from "@joyai/shared";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "../manju-store";
import {
  MODE_OPTIONS,
  RATIO_OPTIONS,
  type ManjuProjectDraft,
  type ManjuVideoSettings,
} from "../manju-types";
import {
  STYLE_TEMPLATES,
  styleIdFromPrompt,
  styleTemplateById,
} from "../config/manju-style-templates";

const FormSchema = ManjuVideoSettingsSchema;
type FormValues = z.infer<typeof FormSchema>;

export function VideoSettingsStep({
  project,
}: {
  project: ManjuProjectDraft;
}) {
  const patchSettings = useManjuStore((s) => s.patchSettings);
  const markStepComplete = useManjuStore((s) => s.markStepComplete);
  const modeLocked = project.shots.some((s) =>
    Boolean(s.videoJobId || s.videoUrl),
  );

  useEffect(() => {
    markStepComplete(project.id, "video-settings");
  }, [markStepComplete, project.id]);

  const resolvedStyleId =
    project.settings.styleId ||
    styleIdFromPrompt(project.settings.style) ||
    undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: {
      ...project.settings,
      mode: project.settings.mode,
      gridLayout: project.settings.gridLayout ?? "2x2",
      llmModelId: project.settings.llmModelId || undefined,
      imageModelId: project.settings.imageModelId || undefined,
      videoModelId: project.settings.videoModelId || undefined,
      styleId: resolvedStyleId,
    },
  });

  const settings = form.watch();

  const commit = (patch: Partial<ManjuVideoSettings>) => {
    const next = { ...project.settings, ...patch };
    patchSettings(project.id, next);
    form.reset({
      ...next,
      gridLayout: next.gridLayout ?? "2x2",
      llmModelId: next.llmModelId || undefined,
      imageModelId: next.imageModelId || undefined,
      videoModelId: next.videoModelId || undefined,
      styleId: next.styleId || styleIdFromPrompt(next.style),
    });
  };

  const pickStyle = (id: string) => {
    const tpl = styleTemplateById(id);
    if (!tpl) return;
    commit({ styleId: tpl.id, style: tpl.prompt });
  };

  return (
    <div className="manju-panel max-w-3xl">
      <section className="manju-card">
        <div className="manju-card__title">视频画面比例</div>
        <div className="manju-chip-row mt-3">
          {RATIO_OPTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cn(
                "manju-chip",
                settings.ratio === r.id && "manju-chip--active",
              )}
              onClick={() => commit({ ratio: r.id })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="manju-card">
        <div className="manju-card__title">生成模式</div>
        <p className="manju-card__desc mb-3">
          {modeLocked
            ? "已提交过分镜视频，模式已锁定，避免同一项目混用。"
            : "图生视频用分镜静帧；全能参考只用资产图；多宫格先出整图再切块逐格视频。首次提交视频后锁定。"}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_OPTIONS.map((m) => {
            const unavailable = !m.available;
            const active = settings.mode === m.id && m.available;
            return (
              <button
                key={m.id}
                type="button"
                disabled={modeLocked || unavailable}
                className={cn(
                  "manju-mode-card",
                  active && "manju-mode-card--active",
                  unavailable && "manju-mode-card--soon",
                )}
                onClick={() => {
                  if (unavailable) return;
                  commit({
                    mode: m.id,
                    gridLayout:
                      m.id === "grid"
                        ? (project.settings.gridLayout ?? "2x2")
                        : project.settings.gridLayout,
                  });
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{m.title}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
        {settings.mode === "grid" ? (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              宫格布局
            </div>
            <div className="manju-chip-row">
              {(
                [
                  { id: "2x2" as const, label: "2×2（4 镜一批）" },
                  { id: "3x3" as const, label: "3×3（9 镜一批）" },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={modeLocked}
                  className={cn(
                    "manju-chip",
                    (settings.gridLayout ?? "2x2") === g.id &&
                      "manju-chip--active",
                  )}
                  onClick={() => commit({ gridLayout: g.id })}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="manju-card">
        <div className="manju-card__title">视觉风格</div>
        <p className="manju-card__desc mb-3">
          选模板会写入风格提示词；可再手工微调下方文案。
        </p>
        <div className="manju-chip-row">
          {STYLE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "manju-chip",
                (settings.styleId === t.id ||
                  (!settings.styleId &&
                    styleIdFromPrompt(settings.style) === t.id)) &&
                  "manju-chip--active",
              )}
              onClick={() => pickStyle(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="manju-style" className="text-xs text-muted-foreground">
            风格提示词
          </Label>
          <Input
            id="manju-style"
            {...form.register("style")}
            onBlur={(e) => {
              const style = e.target.value.trim();
              commit({
                style: style || project.settings.style,
                styleId: undefined,
              });
            }}
            placeholder="自定义风格描述"
          />
        </div>
      </section>

      <section className="manju-card">
        <div className="manju-card__title">默认镜头时长</div>
        <div className="manju-chip-row mt-3">
          {[4, 5, 8, 10].map((d) => (
            <button
              key={d}
              type="button"
              className={cn(
                "manju-chip",
                settings.duration === d && "manju-chip--active",
              )}
              onClick={() => commit({ duration: d })}
            >
              {d}s
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
