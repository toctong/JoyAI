"use client";

import { useMemo, useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import type { ManjuProjectDraft, ManjuShotDraft } from "../../manju-types";
import { ManjuPromptField } from "../../manju-prompt-field";
import { ManjuAssetPicker } from "../../manju-asset-picker";
import { useManjuStore } from "../../manju-store";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Props = {
  project: ManjuProjectDraft;
  episodeId: string;
  locked?: boolean;
};

export function ShotSplitView({ project, episodeId, locked }: Props) {
  const shots = useMemo(
    () =>
      project.shots
        .filter((s) => s.episodeId === episodeId)
        .sort((a, b) => a.index - b.index),
    [project.shots, episodeId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    shots[0]?.id ?? null,
  );
  const updateShot = useManjuStore((s) => s.updateShot);
  const selected =
    shots.find((s) => s.id === selectedId) ?? shots[0] ?? null;

  if (shots.length === 0) {
    return (
      <div className="manju-shot-split manju-shot-split--empty">
        <p>本集还没有镜头。请先在「分镜脚本」页规划或添加镜头。</p>
      </div>
    );
  }

  return (
    <div className="manju-shot-split">
      <aside className="manju-shot-split__list" aria-label="镜头列表">
        {shots.map((shot) => (
          <button
            key={shot.id}
            type="button"
            className={cn(
              "manju-shot-split__item",
              selected?.id === shot.id && "is-active",
            )}
            onClick={() => setSelectedId(shot.id)}
          >
            <span className="manju-shot-split__idx">#{shot.index}</span>
            <span className="manju-shot-split__thumb">
              {shot.storyboardImageUrl ? (
                <JoyAssetThumb
                  url={shot.storyboardImageUrl}
                  size="sm"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="size-4 opacity-40" />
              )}
            </span>
            <span className="manju-shot-split__meta">
              <span className="truncate">
                {shot.visual.trim() || shot.dialogue.trim() || "空镜头"}
              </span>
              <span className="manju-shot-split__flags">
                {shot.storyboardImageUrl ? (
                  <ImageIcon className="size-3" />
                ) : null}
                {shot.videoUrl ? <Film className="size-3" /> : null}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <div className="manju-shot-split__detail">
        {selected ? (
          <ShotDetail
            project={project}
            shot={selected}
            locked={locked}
            onPatch={(patch) => updateShot(project.id, selected.id, patch)}
          />
        ) : null}
      </div>
    </div>
  );
}

function ShotDetail({
  project,
  shot,
  locked,
  onPatch,
}: {
  project: ManjuProjectDraft;
  shot: ManjuShotDraft;
  locked?: boolean;
  onPatch: (patch: Partial<ManjuShotDraft>) => void;
}) {
  const assets = project.assets.filter((a) => a.imageUrl);

  return (
    <div className="manju-shot-detail">
      <header className="manju-shot-detail__head">
        <h3>镜头 #{shot.index}</h3>
        {locked ? (
          <span className="text-xs text-muted-foreground">
            未确认脚本时仅可浏览与改文案
          </span>
        ) : null}
      </header>

      <div className="manju-shot-detail__grid">
        <div className="manju-shot-detail__field">
          <Label>画面描述</Label>
          <Textarea
            value={shot.visual}
            rows={3}
            onChange={(e) => onPatch({ visual: e.target.value })}
          />
        </div>
        <div className="manju-shot-detail__field">
          <Label>对白</Label>
          <Textarea
            value={shot.dialogue}
            rows={2}
            onChange={(e) => onPatch({ dialogue: e.target.value })}
          />
        </div>
        <div className="manju-shot-detail__field">
          <Label>画面提示词</Label>
          <ManjuPromptField
            value={shot.imagePrompt}
            onChange={(v) => onPatch({ imagePrompt: v })}
            assets={project.assets}
            preferredAssetIds={shot.assetRefs}
            placeholder="分镜图提示词…"
          />
        </div>
        <div className="manju-shot-detail__field">
          <Label>视频提示词</Label>
          <ManjuPromptField
            value={shot.videoPrompt}
            onChange={(v) => onPatch({ videoPrompt: v })}
            assets={project.assets}
            preferredAssetIds={shot.assetRefs}
            placeholder="镜头运动 / 情绪…"
          />
        </div>
        <div className="manju-shot-detail__field">
          <Label>关联资产</Label>
          <ManjuAssetPicker
            assets={project.assets}
            value={shot.assetRefs}
            onChange={(ids) => onPatch({ assetRefs: ids })}
          />
        </div>
        <div className="manju-shot-detail__field">
          <Label>尾帧参考（可选，手动选择）</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!shot.endFrameAssetId ? "default" : "outline"}
              onClick={() =>
                onPatch({ endFrameAssetId: null, endFrameImageUrl: null })
              }
            >
              无
            </Button>
            {assets.slice(0, 12).map((a) => (
              <button
                key={a.id}
                type="button"
                className={cn(
                  "manju-shot-detail__endframe",
                  shot.endFrameAssetId === a.id && "is-active",
                )}
                title={a.name}
                onClick={() =>
                  onPatch({
                    endFrameAssetId: a.id,
                    endFrameImageUrl: a.imageUrl,
                  })
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.imageUrl!} alt={a.name} />
              </button>
            ))}
          </div>
        </div>
        <div className="manju-shot-detail__field">
          <Label>时长（秒）</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={shot.duration ?? ""}
            placeholder={String(project.settings.duration)}
            onChange={(e) => {
              const n = Number(e.target.value);
              onPatch({
                duration: Number.isFinite(n) && n > 0 ? n : null,
              });
            }}
          />
        </div>
      </div>

      {(shot.storyboardImageUrl || shot.videoUrl) && (
        <div className="manju-shot-detail__media">
          {shot.storyboardImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.storyboardImageUrl} alt={`分镜 ${shot.index}`} />
          ) : null}
          {shot.videoUrl ? (
            <video src={shot.videoUrl} controls playsInline />
          ) : null}
        </div>
      )}
    </div>
  );
}
