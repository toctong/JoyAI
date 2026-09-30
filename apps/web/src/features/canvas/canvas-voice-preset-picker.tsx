"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic2, Pause, Play } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { CanvasIconClose, CanvasIconSearch } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";
import { ApiError } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import {
  fetchPublicTtsVoices,
  resolveTtsPreviewUrl,
  type PublicTtsVoice,
} from "@/shared/lib/tts-voices";
import "./canvas-voice-preset-picker.css";

export type SelectedVoicePreset = {
  id: string;
  slug: string;
  label: string;
  voiceId: string;
  previewAudioUrl: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Currently selected library voice id (optional highlight). */
  selectedId?: string | null;
  /** Prefer voices bound to this channel / provider first. */
  channelId?: string | null;
  platform?: string | null;
  onSelect: (voice: SelectedVoicePreset) => void;
  onClear?: () => void;
  /** Fallback when library has no preview clips — open material picker. */
  onPickFromLibrary?: () => void;
};

/**
 * 「音色预设」— 后台音色库（已启用）；优先展示有试听 URL 的条目。
 * 选用后由调用方写入 voice，并在有 URL 时挂为参考音频节点。
 */
export function CanvasVoicePresetPicker({
  open,
  onClose,
  selectedId,
  channelId,
  platform,
  onSelect,
  onClear,
  onPickFromLibrary,
}: Props) {
  const [voices, setVoices] = useState<PublicTtsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [onlyWithPreview, setOnlyWithPreview] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setVoices(await fetchPublicTtsVoices());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载音色预设失败");
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPreview();
      return;
    }
    setKeyword("");
    setOnlyWithPreview(true);
    void reload();
  }, [open, reload, stopPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const ranked = useMemo(() => {
    const cid = channelId?.trim();
    const provider = (platform ?? "").trim().toLowerCase();
    const score = (v: PublicTtsVoice) => {
      let s = 0;
      if (cid && v.channelId === cid) s += 4;
      if (
        provider &&
        (v.provider || "").toLowerCase() ===
          (provider === "openai-compatible" || provider === "custom"
            ? "openai"
            : provider)
      ) {
        s += 2;
      }
      if (v.previewAudioUrl?.trim()) s += 1;
      return s;
    };
    return [...voices].sort((a, b) => {
      const d = score(b) - score(a);
      if (d !== 0) return d;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [voices, channelId, platform]);

  const withPreviewCount = useMemo(
    () => ranked.filter((v) => Boolean(v.previewAudioUrl?.trim())).length,
    [ranked],
  );

  const filtered = useMemo(() => {
    let list = ranked;
    if (onlyWithPreview) {
      list = list.filter((v) => Boolean(v.previewAudioUrl?.trim()));
    }
    const q = keyword.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => {
      const hay = [
        v.label,
        v.voiceId,
        v.slug,
        v.category,
        v.gender,
        v.language,
        v.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [ranked, onlyWithPreview, keyword]);

  function playPreview(voice: PublicTtsVoice, event: ReactMouseEvent) {
    event.stopPropagation();
    const src = resolveTtsPreviewUrl(voice.previewAudioUrl);
    if (!src) {
      toast.message("该音色暂无试听音频");
      return;
    }
    if (playingId === voice.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const el = new Audio(src);
    audioRef.current = el;
    setPlayingId(voice.id);
    el.onended = () => {
      if (audioRef.current === el) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    el.onerror = () => {
      toast.error("试听播放失败");
      if (audioRef.current === el) stopPreview();
    };
    void el.play().catch(() => {
      toast.error("试听播放失败");
      stopPreview();
    });
  }

  function pick(voice: PublicTtsVoice) {
    const preview = resolveTtsPreviewUrl(voice.previewAudioUrl) || null;
    onSelect({
      id: voice.id,
      slug: voice.slug,
      label: voice.label || voice.voiceId,
      voiceId: voice.voiceId,
      previewAudioUrl: preview,
    });
    stopPreview();
    onClose();
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-6"
      data-canvas-shortcuts-ignore
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[min(680px,calc(100vh-48px))] w-[min(960px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
          <span className="text-base font-semibold">音色预设</span>
          <span className="text-sm text-muted-foreground">
            来自后台音色库 · 有试听时可挂为参考
          </span>
          {selectedId && onClear ? (
            <button
              type="button"
              className="h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              清除预设
            </button>
          ) : null}
          <label className="ml-auto flex h-9 w-52 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索音色"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="button"
            title="关闭"
            aria-label="关闭"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <CanvasIconClose className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
          <button
            type="button"
            className={cn(
              "h-8 rounded-full px-3 text-xs transition",
              onlyWithPreview
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setOnlyWithPreview(true)}
          >
            有试听 ({withPreviewCount})
          </button>
          <button
            type="button"
            className={cn(
              "h-8 rounded-full px-3 text-xs transition",
              !onlyWithPreview
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setOnlyWithPreview(false)}
          >
            全部启用 ({ranked.length})
          </button>
          {onPickFromLibrary ? (
            <button
              type="button"
              className="ml-auto h-8 rounded-full px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => {
                stopPreview();
                onClose();
                onPickFromLibrary();
              }}
            >
              从素材库选参考
            </button>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : filtered.length === 0 ? (
            <div className="grid h-full min-h-[240px] place-items-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <p>
                {voices.length === 0
                  ? "暂无可用音色，请到后台「音色库」启用并配置试听音频"
                  : onlyWithPreview && withPreviewCount === 0
                    ? "暂无带试听 URL 的音色。可切换「全部启用」，或到后台生成/填写预览音频"
                    : "没有匹配的音色"}
              </p>
              {onPickFromLibrary && voices.length === 0 ? (
                <button
                  type="button"
                  className="h-9 rounded-full bg-muted px-4 text-xs text-foreground transition hover:bg-muted/80"
                  onClick={() => {
                    stopPreview();
                    onClose();
                    onPickFromLibrary();
                  }}
                >
                  从素材库选择音频到节点
                </button>
              ) : null}
              {onlyWithPreview && withPreviewCount === 0 && voices.length > 0 ? (
                <button
                  type="button"
                  className="h-9 rounded-full bg-muted px-4 text-xs text-foreground transition hover:bg-muted/80"
                  onClick={() => setOnlyWithPreview(false)}
                >
                  查看全部启用音色
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((item) => {
                const active = selectedId === item.id;
                const preview = resolveTtsPreviewUrl(item.previewAudioUrl);
                const isPlaying = playingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.voiceId}
                    className={cn(
                      "joy-voice-preset-card",
                      active && "is-active",
                    )}
                    onClick={() => pick(item)}
                  >
                    <span className="joy-voice-preset-card__body">
                      <span className="joy-voice-preset-card__icon">
                        <Mic2 className="size-5 opacity-70" />
                      </span>
                      <span className="joy-voice-preset-card__meta">
                        <span className="joy-voice-preset-card__label">
                          {item.label || item.voiceId}
                        </span>
                        <span className="joy-voice-preset-card__sub">
                          {[item.category, item.gender, item.language]
                            .filter(Boolean)
                            .join(" · ") || item.voiceId}
                        </span>
                      </span>
                      {preview ? (
                        <span
                          role="button"
                          tabIndex={0}
                          title={isPlaying ? "暂停试听" : "试听"}
                          className={cn(
                            "joy-voice-preset-card__play",
                            isPlaying && "is-on",
                          )}
                          onClick={(e) => playPreview(item, e)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              playPreview(
                                item,
                                e as unknown as ReactMouseEvent,
                              );
                            }
                          }}
                        >
                          {isPlaying ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </span>
                      ) : (
                        <span className="joy-voice-preset-card__badge">无试听</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
