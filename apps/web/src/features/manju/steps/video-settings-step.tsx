"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "../manju-store";
import {
  MODE_OPTIONS,
  RATIO_OPTIONS,
  STYLE_PRESETS,
  type ManjuProjectDraft,
} from "../manju-types";

export function VideoSettingsStep({
  project,
}: {
  project: ManjuProjectDraft;
}) {
  const patchSettings = useManjuStore((s) => s.patchSettings);
  const { settings } = project;
  const modeLocked = project.shots.some((s) => Boolean(s.videoJobId || s.videoUrl));

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
              onClick={() => patchSettings(project.id, { ratio: r.id })}
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
            ? "已提交过分镜视频，模式已锁定，避免同一项目混用首帧与参考。"
            : "图生视频用分镜静帧作首帧；全能参考只用资产图，不混首帧。多宫格切块尚未实现。首次提交视频后锁定。"}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={modeLocked}
              className={cn(
                "manju-mode-card",
                settings.mode === m.id && "manju-mode-card--active",
              )}
              onClick={() => patchSettings(project.id, { mode: m.id })}
            >
              <div className="font-semibold">{m.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="manju-card">
        <div className="manju-card__title">视觉风格</div>
        <div className="manju-chip-row mt-3">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={cn(
                "manju-chip",
                settings.style === s && "manju-chip--active",
              )}
              onClick={() => patchSettings(project.id, { style: s })}
            >
              {s}
            </button>
          ))}
        </div>
        <Input
          value={settings.style}
          onChange={(e) =>
            patchSettings(project.id, { style: e.target.value })
          }
          placeholder="自定义风格描述"
          className="mt-3"
        />
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
              onClick={() => patchSettings(project.id, { duration: d })}
            >
              {d}s
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
