"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mic2 } from "lucide-react";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import {
  fallbackVoiceChips,
  fetchPublicTtsVoices,
  libraryToVoiceChips,
  pickLibraryVoices,
  type PublicTtsVoice,
  type VoiceChipOption,
} from "@/shared/lib/tts-voices";
import type { ComposerModelOption } from "@/features/studio/composer-model-menu";
import type { ManjuAssetDetail, ManjuAssetDraft } from "./manju-types";
import { registerVoiceJob } from "./lib/pending-voice-job";
import { submitAudioJob } from "./use-manju-jobs";

const DEFAULT_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

const DEFAULT_FORMATS = ["mp3", "wav", "opus", "aac", "flac", "pcm"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  asset: ManjuAssetDraft;
  detail: ManjuAssetDetail;
};

export function ManjuVoiceTtsDialog({
  open,
  onOpenChange,
  projectId,
  asset,
  detail,
}: Props) {
  const [models, setModels] = useState<ComposerModelOption[]>([]);
  const [library, setLibrary] = useState<PublicTtsVoice[]>([]);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [format, setFormat] =
    useState<(typeof DEFAULT_FORMATS)[number]>("mp3");
  const [speed, setSpeed] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const sample = `你好，我是${asset.name.trim() || "角色"}。`;
    setPrompt(sample);
    setInstructions(detail.voiceNote?.trim() ?? "");
    setVoice("alloy");
    setFormat("mp3");
    setSpeed(1);
    setModelId("");
  }, [open, asset.id, asset.name, detail.voiceNote]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      api<ComposerModelOption[]>("/models"),
      fetchPublicTtsVoices().catch(() => [] as PublicTtsVoice[]),
    ])
      .then(([list, voices]) => {
        if (cancelled) return;
        const audio = (list ?? []).filter((m) => m.kind === "audio");
        setModels(audio);
        setLibrary(voices ?? []);
        if (audio[0] && !modelId) setModelId(audio[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setModels([]);
          setLibrary([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on open
  }, [open]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId],
  );

  const voiceOptions = useMemo((): VoiceChipOption[] => {
    const matched = pickLibraryVoices(library, {
      channelId: selectedModel?.channel?.id,
      platform: selectedModel?.channel?.platform,
    });
    if (matched.length) return libraryToVoiceChips(matched);
    const fromCaps = selectedModel?.capabilities?.voices?.filter(Boolean);
    return fallbackVoiceChips(
      fromCaps?.length ? fromCaps : [...DEFAULT_VOICES],
    );
  }, [library, selectedModel]);

  const formatOptions = useMemo(() => {
    const fromCaps = selectedModel?.capabilities?.audioFormats?.filter(Boolean);
    return (fromCaps?.length ? fromCaps : [...DEFAULT_FORMATS]) as string[];
  }, [selectedModel]);

  useEffect(() => {
    if (!voiceOptions.some((o) => o.value === voice) && voiceOptions[0]) {
      setVoice(voiceOptions[0].value);
    }
  }, [voiceOptions, voice]);

  useEffect(() => {
    if (!formatOptions.includes(format) && formatOptions[0]) {
      setFormat(formatOptions[0] as (typeof DEFAULT_FORMATS)[number]);
    }
  }, [formatOptions, format]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text) {
      toast.error("请填写试听台词");
      return;
    }
    setSubmitting(true);
    try {
      const job = await submitAudioJob({
        prompt: text,
        voice,
        format: format as "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm",
        speed,
        instructions: instructions.trim() || undefined,
        modelId: modelId || undefined,
        manjuProjectId: projectId,
      });
      registerVoiceJob(job.id, { projectId, assetId: asset.id });
      onOpenChange(false);
      toast.success("已提交 AI 配音");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const modelLabel =
    selectedModel?.name ?? (modelId ? "已选模型" : "自动（渠道默认）");
  const modelIcon = selectedModel
    ? modelIconSrc({
        remoteId: selectedModel.remoteId,
        name: selectedModel.name,
      })
    : null;
  const fromLibrary = voiceOptions.some((o) => o.fromLibrary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic2 className="size-4" />
            AI 配音 · {asset.name.trim() || "角色"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>试听台词</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="输入要合成的短句，用于生成角色参考音色…"
              maxLength={4000}
            />
          </div>

          <div className="space-y-2">
            <Label>语气指示（可选）</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              placeholder="冷静、笃定的年轻女性声音…"
              maxLength={2000}
            />
            <p className="text-[12px] text-muted-foreground">
              默认带入文本音色描述；写入 TTS instructions。
            </p>
          </div>

          <div className="space-y-2">
            <Label>模型</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full justify-start gap-2 font-normal"
                >
                  {modelIcon ? (
                    <BrandAvatar src={modelIcon} label={modelLabel} size={18} />
                  ) : null}
                  <span className="truncate">{modelLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-auto"
              >
                {models.length === 0 ? (
                  <DropdownMenuItem disabled>
                    暂无音频模型，请先在管理端启用 TTS
                  </DropdownMenuItem>
                ) : (
                  models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setModelId(m.id)}
                    >
                      {m.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>音色</Label>
              <span className="text-[11px] text-muted-foreground">
                {fromLibrary ? "音色库" : "模型默认"}
              </span>
            </div>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {voiceOptions.map((item) => (
                <button
                  key={`${item.value}-${item.label}`}
                  type="button"
                  title={item.value}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[12px]",
                    voice === item.value
                      ? "border-ring bg-accent"
                      : "border-border hover:bg-muted",
                  )}
                  onClick={() => setVoice(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>格式</Label>
            <div className="flex flex-wrap gap-1.5">
              {formatOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-1 text-[12px] uppercase",
                    format === item
                      ? "border-ring bg-accent"
                      : "border-border hover:bg-muted",
                  )}
                  onClick={() =>
                    setFormat(item as (typeof DEFAULT_FORMATS)[number])
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>语速</Label>
              <span className="text-[12px] text-muted-foreground">{speed}x</span>
            </div>
            <Input
              type="range"
              min={0.75}
              max={2}
              step={0.25}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                提交中…
              </>
            ) : (
              "生成配音"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
