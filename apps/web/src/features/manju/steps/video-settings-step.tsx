"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ManjuVideoSettingsSchema } from "@joyai/shared";
import { z } from "zod";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
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

  const [hoverModeId, setHoverModeId] = useState<string | null>(null);
  const tipMode =
    MODE_OPTIONS.find((m) => m.id === (hoverModeId ?? settings.mode)) ??
    MODE_OPTIONS.find((m) => m.id === settings.mode) ??
    null;

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
    <div className="manju-panel manju-settings-panel">
      <section className="manju-settings-block">
        <div className="manju-settings-block__head">
          <h3 className="manju-settings-block__title">视频画面比例</h3>
        </div>
        <div className="manju-chip-row">
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

      <section className="manju-settings-block">
        <div className="manju-settings-block__head">
          <h3 className="manju-settings-block__title">生分镜视频方式</h3>
          {modeLocked ? (
            <span className="manju-settings-lock">已锁定</span>
          ) : (
            <span className="manju-settings-hint">
              <Info className="size-3.5" aria-hidden />
              首次提交分镜视频后锁定
            </span>
          )}
        </div>

        <div
          className="manju-mode-grid"
          onMouseLeave={() => setHoverModeId(null)}
        >
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
                onMouseEnter={() => setHoverModeId(m.id)}
                onFocus={() => setHoverModeId(m.id)}
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
                <div className="manju-mode-card__row">
                  <div className="manju-mode-card__title">{m.title}</div>
                  <span className="manju-mode-card__badge">{m.badge}</span>
                </div>
                <p className="manju-mode-card__desc">{m.desc}</p>
              </button>
            );
          })}
        </div>

        {tipMode ? (
          <div
            className="manju-mode-tip"
            role="tooltip"
            onMouseEnter={() => setHoverModeId(tipMode.id)}
            onMouseLeave={() => setHoverModeId(null)}
          >
            <video
              key={tipMode.id}
              className="manju-mode-tip__video"
              src={tipMode.previewVideo}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
            />
            <p className="manju-mode-tip__text">{tipMode.detail}</p>
          </div>
        ) : null}

        {settings.mode === "grid" ? (
          <div className="manju-mode-detail__grid">
            <span className="manju-mode-detail__grid-label">宫格布局</span>
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

      <section className="manju-settings-block">
        <div className="manju-settings-block__head">
          <h3 className="manju-settings-block__title">选择画面风格</h3>
        </div>
        <p className="manju-settings-sub">风格库</p>
        <div className="manju-style-carousel">
          <Carousel
            opts={{
              align: "start",
              dragFree: true,
              containScroll: "trimSnaps",
            }}
            className="manju-style-carousel__viewport"
          >
            <CarouselContent className="manju-style-carousel__track">
              {STYLE_TEMPLATES.map((t) => {
                const active =
                  settings.styleId === t.id ||
                  (!settings.styleId &&
                    styleIdFromPrompt(settings.style) === t.id);
                return (
                  <CarouselItem
                    key={t.id}
                    className="manju-style-carousel__item"
                  >
                    <button
                      type="button"
                      className={cn(
                        "manju-style-card",
                        active && "manju-style-card--active",
                      )}
                      onClick={() => pickStyle(t.id)}
                    >
                      <span
                        className={cn(
                          "manju-style-card__thumb",
                          `manju-style-card__thumb--${t.tone}`,
                        )}
                        aria-hidden
                      />
                      <span className="manju-style-card__label">{t.label}</span>
                    </button>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <CarouselPrevious className="manju-style-carousel__prev" />
            <CarouselNext className="manju-style-carousel__next" />
          </Carousel>
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

      <section className="manju-settings-block">
        <div className="manju-settings-block__head">
          <h3 className="manju-settings-block__title">默认镜头时长</h3>
        </div>
        <div className="manju-chip-row">
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
