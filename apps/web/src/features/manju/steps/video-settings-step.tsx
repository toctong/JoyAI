"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ManjuVideoSettingsSchema } from "@joyai/shared";
import { z } from "zod";
import { Info, LayoutGrid, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { api, ApiError } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { useChannelModels } from "../manju-studio";
import { ManjuModelSelect } from "../manju-model-select";
import { useManjuStore } from "../manju-store";
import {
  MODE_OPTIONS,
  type ManjuProjectDraft,
  type ManjuVideoSettings,
} from "../manju-types";
import {
  mapStyleApiRows,
  styleIdFromPrompt,
  styleTemplateById,
  type ManjuStyleTemplate,
  type StyleApiRow,
} from "../config/manju-style-templates";

const FormSchema = ManjuVideoSettingsSchema;
type FormValues = z.infer<typeof FormSchema>;

const STYLE_PREVIEW_COUNT = 5;

const PRIMARY_RATIOS = [
  { id: "16:9" as const, label: "16:9", Icon: RectangleHorizontal },
  { id: "9:16" as const, label: "9:16", Icon: RectangleVertical },
];

function StyleCard({
  template,
  active,
  onPick,
}: {
  template: ManjuStyleTemplate;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("manju-style-card", active && "manju-style-card--active")}
      onClick={onPick}
    >
      <span
        className={cn(
          "manju-style-card__thumb",
          `manju-style-card__thumb--${template.tone}`,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staticAssetUrl(template.thumb)}
          alt=""
          className="manju-style-card__img"
          draggable={false}
        />
        <span className="manju-style-card__label">{template.label}</span>
      </span>
    </button>
  );
}

function SettingLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="manju-init__label">
      <span className="manju-init__label-bar" aria-hidden />
      <h3 className="manju-init__label-text">{children}</h3>
      {hint ? (
        <span className="manju-init__label-hint" title={hint}>
          <Info className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

/**
 * 初始设定 — project defaults (ratio / mode / style / duration / channel models).
 */
export function VideoSettingsStep({
  project,
}: {
  project: ManjuProjectDraft;
}) {
  const patchSettings = useManjuStore((s) => s.patchSettings);
  const updateProject = useManjuStore((s) => s.updateProject);
  const markStepComplete = useManjuStore((s) => s.markStepComplete);
  const groups = useChannelModels();
  const modeLocked = project.shots.some((s) =>
    Boolean(s.videoJobId || s.videoUrl),
  );

  const [styles, setStyles] = useState<ManjuStyleTemplate[]>([]);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [styleLibraryOpen, setStyleLibraryOpen] = useState(false);
  const [hoverModeId, setHoverModeId] = useState<string | null>(null);

  useEffect(() => {
    markStepComplete(project.id, "video-settings");
  }, [markStepComplete, project.id]);

  useEffect(() => {
    setTitleDraft(project.title);
  }, [project.title]);

  useEffect(() => {
    let alive = true;
    void api<StyleApiRow[]>("/styles?surface=manju")
      .then((rows) => {
        if (!alive) return;
        setStyles(mapStyleApiRows(rows));
      })
      .catch((e) => {
        toast.error(e instanceof ApiError ? e.message : "加载风格库失败");
      });
    return () => {
      alive = false;
    };
  }, []);

  const resolvedStyleId =
    project.settings.styleId ||
    styleIdFromPrompt(project.settings.style, styles) ||
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
      styleId: next.styleId || styleIdFromPrompt(next.style, styles),
    });
  };

  const pickStyle = (id: string) => {
    const tpl = styleTemplateById(id, styles);
    if (!tpl) return;
    commit({ styleId: tpl.id, style: tpl.prompt });
    setStyleLibraryOpen(false);
  };

  const activeStyleId =
    (settings.styleId && styleTemplateById(settings.styleId, styles)?.id) ||
    styleIdFromPrompt(settings.style, styles) ||
    undefined;

  const isStyleActive = (id: string) => activeStyleId === id;

  const previewStyles = (() => {
    const head = styles.slice(0, STYLE_PREVIEW_COUNT);
    if (!activeStyleId || head.some((t) => t.id === activeStyleId)) return head;
    const active = styles.find((t) => t.id === activeStyleId);
    if (!active) return head;
    return [active, ...head.slice(0, STYLE_PREVIEW_COUNT - 1)];
  })();
  const customActive = !activeStyleId && Boolean(settings.style?.trim());

  const modelRows = [
    { key: "llmModelId" as const, label: "文本模型", items: groups.llm },
    { key: "imageModelId" as const, label: "图像模型", items: groups.image },
    { key: "videoModelId" as const, label: "视频模型", items: groups.video },
  ];

  function handleUpdate() {
    const title = titleDraft.trim() || "未命名漫剧";
    if (title !== project.title) {
      updateProject(project.id, { title });
    }
    toast.success("初始设定已更新");
  }

  return (
    <div className="manju-init">
      <header className="manju-init__page-head">
        <h1 className="manju-init__page-title">初始设定</h1>
      </header>

      <section className="manju-init__section">
        <SettingLabel hint="项目显示名称">项目名称</SettingLabel>
        <Input
          className="manju-init__input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const title = titleDraft.trim() || "未命名漫剧";
            if (title !== project.title) updateProject(project.id, { title });
          }}
          maxLength={48}
          placeholder="未命名漫剧"
        />
      </section>

      <section className="manju-init__section">
        <SettingLabel hint="影响分镜与成片画幅">画面比例</SettingLabel>
        <div className="manju-init__chips">
          {PRIMARY_RATIOS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "manju-init__chip",
                settings.ratio === id && "is-on",
              )}
              onClick={() => commit({ ratio: id })}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="manju-init__section manju-init__section--modes">
        <SettingLabel hint="悬停查看预览与说明；首次提交分镜视频后锁定">
          创作模式
        </SettingLabel>
        <div
          className="manju-mode-grid"
          onMouseLeave={() => setHoverModeId(null)}
        >
          {MODE_OPTIONS.map((m) => {
            const unavailable = !m.available;
            const active = settings.mode === m.id && m.available;
            const showTip = hoverModeId === m.id && !unavailable;
            return (
              <div
                key={m.id}
                className={cn(
                  "manju-mode-card-wrap",
                  unavailable && "manju-mode-card-wrap--soon",
                )}
                onMouseEnter={() => {
                  if (!unavailable) setHoverModeId(m.id);
                }}
              >
                {showTip ? (
                  <div className="manju-mode-tip" role="tooltip">
                    <div className="manju-mode-tip__media">
                      <video
                        key={m.id}
                        className="manju-mode-tip__video"
                        src={m.previewVideo}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                      />
                    </div>
                    <p className="manju-mode-tip__text">{m.detail}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={modeLocked || unavailable}
                  className={cn(
                    "manju-mode-card",
                    active && "manju-mode-card--active",
                    unavailable && "manju-mode-card--soon",
                  )}
                  onFocus={() => {
                    if (!unavailable) setHoverModeId(m.id);
                  }}
                  onBlur={() => setHoverModeId(null)}
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
              </div>
            );
          })}
        </div>
        {modeLocked ? (
          <p className="manju-init__hint">已有视频任务，创作模式已锁定</p>
        ) : null}
        {settings.mode === "grid" ? (
          <div className="manju-mode-detail__grid">
            <span className="manju-mode-detail__grid-label">宫格布局</span>
            <div className="manju-init__chips">
              {(
                [
                  { id: "2x2" as const, label: "2×2" },
                  { id: "3x3" as const, label: "3×3" },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={modeLocked}
                  className={cn(
                    "manju-init__chip",
                    (settings.gridLayout ?? "2x2") === g.id && "is-on",
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

      <section className="manju-init__section">
        <SettingLabel hint="文本 / 图像 / 视频任务默认使用的渠道模型">
          漫剧默认模型
        </SettingLabel>
        <div className="manju-init__models">
          {modelRows.map((row) => (
            <div key={row.key} className="manju-init__model-row">
              <Label className="manju-init__model-label">{row.label}</Label>
              <ManjuModelSelect
                models={row.items}
                value={settings[row.key]?.trim() || ""}
                onChange={(next) => commit({ [row.key]: next })}
                className="manju-init__select"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="manju-init__section">
        <SettingLabel>画面风格</SettingLabel>
        <div className="manju-style-row">
          {previewStyles.map((t) => (
            <StyleCard
              key={t.id}
              template={t}
              active={isStyleActive(t.id)}
              onPick={() => pickStyle(t.id)}
            />
          ))}
          <button
            type="button"
            className="manju-style-card manju-style-card--more"
            onClick={() => setStyleLibraryOpen(true)}
          >
            <span className="manju-style-card__thumb manju-style-card__thumb--more">
              <LayoutGrid className="size-5" aria-hidden />
              <span className="manju-style-card__label">更多</span>
            </span>
          </button>
        </div>

        <Dialog open={styleLibraryOpen} onOpenChange={setStyleLibraryOpen}>
          <DialogContent className="manju-style-dialog">
            <DialogHeader>
              <DialogTitle>风格库</DialogTitle>
            </DialogHeader>
            <div className="manju-style-dialog__body">
              {styles.length === 0 ? (
                <div className="manju-style-dialog__empty">暂无风格模板</div>
              ) : (
                <div className="manju-style-dialog__grid">
                  {styles.map((t) => (
                    <StyleCard
                      key={t.id}
                      template={t}
                      active={isStyleActive(t.id)}
                      onPick={() => pickStyle(t.id)}
                    />
                  ))}
                  <button
                    type="button"
                    className={cn(
                      "manju-style-card",
                      "manju-style-card--custom",
                      customActive && "manju-style-card--active",
                    )}
                    onClick={() => {
                      setStyleLibraryOpen(false);
                      requestAnimationFrame(() => {
                        document.getElementById("manju-style")?.focus();
                      });
                    }}
                  >
                    <span className="manju-style-card__thumb manju-style-card__thumb--custom">
                      <span className="manju-style-card__label">自定义</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="manju-init__field">
          <Label htmlFor="manju-style" className="manju-init__field-label">
            风格提示词
          </Label>
          <Input
            id="manju-style"
            className="manju-init__input"
            {...form.register("style")}
            onBlur={(e) => {
              const style = e.target.value.trim();
              commit({
                style: style || project.settings.style,
                styleId: styleIdFromPrompt(style, styles),
              });
            }}
            placeholder="自定义风格描述"
          />
        </div>
      </section>

      <section className="manju-init__section">
        <SettingLabel>默认镜头时长</SettingLabel>
        <div className="manju-init__chips">
          {[4, 5, 8, 10].map((d) => (
            <button
              key={d}
              type="button"
              className={cn(
                "manju-init__chip",
                settings.duration === d && "is-on",
              )}
              onClick={() => commit({ duration: d })}
            >
              {d}s
            </button>
          ))}
        </div>
      </section>

      <div className="manju-init__footer">
        <Button type="button" className="manju-init__submit" onClick={handleUpdate}>
          更新
        </Button>
      </div>
    </div>
  );
}
