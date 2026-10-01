"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileUser,
  FolderOpen,
  Images,
  Loader2,
  Mic2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  User,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { apiUpload } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { guessManjuAssetDetail, mergeManjuAssetDetail } from "@joyai/shared";
import { ManjuLibraryImport } from "../../manju-library-import";
import { ManjuAudioLibraryDialog } from "../../manju-audio-library-dialog";
import { ManjuVoiceTtsDialog } from "../../manju-voice-tts-dialog";
import { AssetRefUpload } from "../../asset-ref-upload";
import { ManjuTextField } from "../../manju-text-field";
import { useManjuStore } from "../../manju-store";
import { submitImageJob } from "../../use-manju-jobs";
import {
  buildAssetPrompt,
  isBusyStatus,
  type ManjuAssetDetail,
  type ManjuAssetDraft,
} from "../../manju-types";
import { preferredAssetRatio } from "../../lib/prompt-builders";
import {
  manjuAssetListSection,
  manjuStudioHref,
} from "../manju-studio-routes";
import {
  ManjuAssetGeneratePanel,
  type ManjuAssetGenMode,
} from "../manju-asset-generate-panel";

type DetailTab = "info" | "look" | "images";

const KIND_LABEL: Record<ManjuAssetDraft["kind"], string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

const GENDER_OPTIONS = ["女", "男", "其他"] as const;
const ROLE_TYPE_OPTIONS = [
  "女主角",
  "男主角",
  "女配角",
  "男配角",
  "反派",
  "路人",
] as const;

const SCENE_TYPE_OPTIONS = ["室外", "室内", "半开放"] as const;

const PROP_ATTR_FIELDS = [
  { key: "propTexture", label: "质感" },
  { key: "propMaterial", label: "材质" },
  { key: "propSize", label: "尺寸" },
  { key: "propWear", label: "磨损情况" },
  { key: "propSpecial", label: "特殊效果" },
  { key: "propFinish", label: "色泽与表面处理" },
] as const;

const LOOK_FIELDS = [
  { key: "height", label: "身高", half: true },
  { key: "weight", label: "体重", half: true },
  { key: "bodyType", label: "体态", half: true },
  { key: "hairstyle", label: "发型", half: true },
  { key: "face", label: "脸型", half: true },
  { key: "gaze", label: "眼神", half: true },
  { key: "skin", label: "肤色", half: false },
  { key: "clothing", label: "衣着", half: false },
  { key: "headwear", label: "配饰", half: false },
  { key: "traits", label: "特征", half: false },
] as const;

function patchDetail(
  asset: ManjuAssetDraft,
  patch: Partial<ManjuAssetDetail>,
): ManjuAssetDetail {
  return { ...(asset.detail ?? {}), ...patch };
}

export function AssetDetailStage({
  projectId,
  assetId,
  lockedKind,
}: {
  projectId: string;
  assetId: string;
  lockedKind: ManjuAssetDraft["kind"];
}) {
  const router = useRouter();
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateAsset = useManjuStore((s) => s.updateAsset);
  const bindJobToAsset = useManjuStore((s) => s.bindJobToAsset);
  const [tab, setTab] = useState<DetailTab>("info");
  const [busyGen, setBusyGen] = useState(false);
  const [lookEditing, setLookEditing] = useState(false);
  const [propDraft, setPropDraft] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [voiceTtsOpen, setVoiceTtsOpen] = useState(false);
  const [audioLibOpen, setAudioLibOpen] = useState(false);

  const asset = useMemo(
    () => project?.assets.find((a) => a.id === assetId) ?? null,
    [project, assetId],
  );

  const listHref = manjuStudioHref(
    projectId,
    manjuAssetListSection(lockedKind),
  );

  useEffect(() => {
    if (asset?.kind !== "character" && tab === "look") setTab("info");
  }, [asset?.kind, tab]);

  useEffect(() => {
    if (!asset || asset.kind !== "character") return;
    const d = asset.detail ?? {};
    const hasLook = LOOK_FIELDS.some(({ key }) => Boolean(d[key]?.trim()));
    if (hasLook) return;
    const source = `${asset.description}\n${d.story ?? ""}`.trim();
    if (!source) return;
    const next = mergeManjuAssetDetail(
      asset.detail,
      guessManjuAssetDetail("character", source),
    );
    if (!next) return;
    const filled = LOOK_FIELDS.some(({ key }) => Boolean(next[key]?.trim()));
    if (!filled) return;
    updateAsset(projectId, asset.id, { detail: next });
  }, [asset, projectId, updateAsset]);

  if (!project) return null;

  if (!asset || asset.kind !== lockedKind) {
    return (
      <div className="manju-asset-detail manju-asset-detail--missing">
        <p>未找到该{KIND_LABEL[lockedKind]}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={listHref}>返回列表</Link>
        </Button>
      </div>
    );
  }

  const detail = asset.detail ?? {};
  const kindLabel = KIND_LABEL[asset.kind];
  const busy = isBusyStatus(asset.status) || busyGen;
  const voiceUseText = detail.voiceUseText ?? Boolean(detail.voiceNote?.trim());
  const voiceUseAudio =
    detail.voiceUseAudio ?? Boolean(detail.voiceAudioUrl?.trim());
  const hasLookData = LOOK_FIELDS.some(({ key }) =>
    Boolean(detail[key]?.trim()),
  );

  const setDetailField = <K extends keyof ManjuAssetDetail>(
    key: K,
    value: ManjuAssetDetail[K],
  ) => {
    updateAsset(projectId, asset.id, {
      detail: patchDetail(asset, { [key]: value }),
    });
  };

  const generateImage = async (payload: {
    mode: ManjuAssetGenMode;
    prompt: string;
    modelId: string;
    ratio: string;
    referenceAssetIds?: string[];
    referenceUrls?: string[];
  }) => {
    if (!asset.name.trim()) {
      toast.error("请先填写名称");
      return;
    }
    const prompt = payload.prompt.trim();
    if (!prompt) {
      toast.error("请填写提示词");
      return;
    }
    const refIds = payload.referenceAssetIds?.filter(Boolean) ?? [];
    const refUrls = payload.referenceUrls?.filter(Boolean) ?? [];
    if (
      payload.mode === "img2img" &&
      refIds.length === 0 &&
      refUrls.length === 0
    ) {
      toast.error("图生图需要至少一张参考图");
      return;
    }
    setBusyGen(true);
    try {
      updateAsset(projectId, asset.id, {
        status: "queued",
        jobId: null,
        description: prompt,
      });
      const job = await submitImageJob({
        prompt,
        ratio: payload.ratio || preferredAssetRatio(asset.kind),
        modelId: payload.modelId || project.settings.imageModelId,
        manjuProjectId: project.id,
        referenceAssetIds: refIds.length > 0 ? refIds : undefined,
        referenceUrls: refUrls.length > 0 ? refUrls : undefined,
      });
      bindJobToAsset(projectId, asset.id, job.id, "queued");
      setGenOpen(false);
      toast.success(
        payload.mode === "img2img" ? "已提交图生图" : "已提交文生图",
      );
    } catch (e) {
      updateAsset(projectId, asset.id, { status: "failed", jobId: null });
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusyGen(false);
    }
  };

  const openGenerate = () => {
    if (!asset.name.trim()) {
      toast.error("请先填写名称");
      return;
    }
    setGenOpen(true);
  };

  const uploadImage = async (file: File) => {
    try {
      updateAsset(projectId, asset.id, { status: "running" });
      const saved = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      updateAsset(projectId, asset.id, {
        imageUrl: saved.url,
        assetId: saved.id,
        jobId: null,
        status: "succeeded",
      });
      useManjuStore.getState().markStepComplete(projectId, "assets");
      toast.success("图片已上传");
    } catch (e) {
      updateAsset(projectId, asset.id, { status: "failed" });
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const uploadVoiceAudio = async (file: File) => {
    try {
      const saved = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      updateAsset(projectId, asset.id, {
        detail: patchDetail(asset, {
          voiceAudioUrl: saved.url,
          voiceUseAudio: true,
        }),
      });
      toast.success("音色音频已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const tabs: { id: DetailTab; label: string }[] =
    asset.kind === "character"
      ? [
          { id: "info", label: `${kindLabel}信息` },
          { id: "look", label: "外观数据" },
          { id: "images", label: "图片管理" },
        ]
      : [
          { id: "info", label: `${kindLabel}信息` },
          { id: "images", label: "图片管理" },
        ];

  const fillLookFromDescription = () => {
    const source = `${asset.description}\n${detail.story ?? ""}`.trim();
    if (!source) {
      toast.message("请先在角色信息里填写描述或背景");
      return;
    }
    const next = mergeManjuAssetDetail(
      asset.detail,
      guessManjuAssetDetail("character", source),
    );
    if (!next) {
      toast.message("描述里还没有可拆的外观信息");
      return;
    }
    updateAsset(projectId, asset.id, { detail: next });
    setLookEditing(true);
    toast.success("已从描述填入外观数据，可再微调");
  };

  const sceneProps = detail.sceneProps ?? [];

  const addSceneProp = () => {
    const name = propDraft.trim();
    if (!name) return;
    if (sceneProps.includes(name)) {
      toast.message("该道具已添加");
      return;
    }
    setDetailField("sceneProps", [...sceneProps, name]);
    setPropDraft("");
  };

  return (
    <JoyPhotoProvider>
      <div className="manju-asset-detail">
        <div className="manju-asset-detail__head">
          <button
            type="button"
            className="manju-asset-detail__back"
            onClick={() => router.push(listHref)}
          >
            <ChevronLeft className="size-4" />
            <span className="manju-asset-detail__back-name">
              {asset.name.trim() || `未命名${kindLabel}`}
            </span>
          </button>
          <div className="manju-asset-detail__tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  "manju-asset-detail__tab",
                  tab === t.id && "is-on",
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "info" ? (
          <div
            className={cn(
              "manju-asset-detail__grid",
              (asset.kind === "character" || asset.kind === "scene") &&
                "manju-asset-detail__grid--info",
            )}
          >
            <section
              className={cn(
                "manju-asset-detail__card",
                asset.kind === "scene" && "manju-asset-detail__card--wide",
                asset.kind === "prop" && "manju-asset-detail__card--wide",
              )}
            >
              <div className="manju-asset-detail__card-intro">
                <h2 className="manju-asset-detail__card-title">基本信息</h2>
                <p className="manju-asset-detail__card-sub">
                  {asset.kind === "scene"
                    ? "填写场景的基本信息和描述"
                    : asset.kind === "character"
                      ? "编辑角色的基本信息和背景故事"
                      : "填写道具的基本信息和描述"}
                </p>
              </div>
              <div className="manju-asset-detail__fields">
                <label className="manju-asset-detail__field manju-asset-detail__field--span2">
                  <span>
                    {kindLabel}名称
                    <em className="manju-asset-detail__req">*</em>
                  </span>
                  <Input
                    value={asset.name}
                    onChange={(e) =>
                      updateAsset(projectId, asset.id, {
                        name: e.target.value,
                      })
                    }
                    placeholder={`${kindLabel}名称`}
                  />
                </label>
                {asset.kind === "character" ? (
                  <>
                    <label className="manju-asset-detail__field">
                      <span>年龄</span>
                      <Input
                        value={detail.age ?? ""}
                        onChange={(e) => setDetailField("age", e.target.value)}
                        placeholder="如 28"
                      />
                    </label>
                    <div className="manju-asset-detail__field">
                      <span>性别</span>
                      <Select
                        value={detail.gender || undefined}
                        onValueChange={(v) => setDetailField("gender", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择性别" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDER_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="manju-asset-detail__field manju-asset-detail__field--span2">
                      <span>角色类型</span>
                      <Select
                        value={detail.roleType || undefined}
                        onValueChange={(v) => setDetailField("roleType", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择角色类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_TYPE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
              {asset.kind === "character" ? (
                <label className="manju-asset-detail__field manju-asset-detail__field--block">
                  <span>角色故事 / 背景</span>
                  <ManjuTextField
                    value={detail.story ?? ""}
                    onChange={(story) => setDetailField("story", story)}
                    placeholder="身世、关系、动机…"
                    minHeight={120}
                  />
                </label>
              ) : asset.kind === "scene" ? (
                <label className="manju-asset-detail__field manju-asset-detail__field--block">
                  <span>场景描述</span>
                  <ManjuTextField
                    value={detail.story ?? ""}
                    onChange={(story) => setDetailField("story", story)}
                    placeholder="空间结构、陈设、天气与氛围等…"
                    minHeight={140}
                  />
                </label>
              ) : (
                <label className="manju-asset-detail__field manju-asset-detail__field--block">
                  <span>道具描述</span>
                  <ManjuTextField
                    value={detail.story ?? ""}
                    onChange={(story) => setDetailField("story", story)}
                    placeholder="用途、外观、剧情作用等…"
                    minHeight={120}
                  />
                </label>
              )}
            </section>

            {asset.kind === "character" ? (
              <section className="manju-asset-detail__card">
                <div className="manju-asset-detail__card-head">
                  <div className="manju-asset-detail__card-intro">
                    <h2 className="manju-asset-detail__card-title">文字人设</h2>
                    <p className="manju-asset-detail__card-sub">
                      用于 AI 生成此角色图像的默认提示词
                    </p>
                  </div>
                </div>
                <ManjuTextField
                  value={asset.description}
                  onChange={(description) =>
                    updateAsset(projectId, asset.id, { description })
                  }
                  placeholder="外貌、服饰、气质、镜头与画质等，用于生图提示词…"
                  minHeight={200}
                />
              </section>
            ) : null}

            {asset.kind === "scene" || asset.kind === "prop" ? (
              <section className="manju-asset-detail__card manju-asset-detail__card--wide">
                <div className="manju-asset-detail__card-head">
                  <div className="manju-asset-detail__card-intro">
                    <h2 className="manju-asset-detail__card-title">
                      AI 绘画默认提示词
                    </h2>
                    <p className="manju-asset-detail__card-sub">
                      用于 AI 生成此{kindLabel}图像的默认提示词
                    </p>
                  </div>
                </div>
                <ManjuTextField
                  value={asset.description}
                  onChange={(description) =>
                    updateAsset(projectId, asset.id, { description })
                  }
                  placeholder={
                    asset.kind === "scene"
                      ? "机位、构图、光线、天气与画质约束等…"
                      : "角度、材质、色泽、背景与画质约束等…"
                  }
                  minHeight={160}
                />
              </section>
            ) : null}

            {asset.kind === "prop" ? (
              <section className="manju-asset-detail__card manju-asset-detail__card--wide">
                <div className="manju-asset-detail__card-intro">
                  <h2 className="manju-asset-detail__card-title">道具信息</h2>
                </div>
                <div className="manju-asset-detail__fields manju-asset-detail__fields--prop">
                  {PROP_ATTR_FIELDS.map(({ key, label }) => (
                    <label key={key} className="manju-asset-detail__field">
                      <span>{label}</span>
                      <ManjuTextField
                        value={detail[key] ?? ""}
                        onChange={(v) => setDetailField(key, v)}
                        placeholder={label}
                        minHeight={64}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {asset.kind === "scene" ? (
              <div className="manju-asset-detail__scene-row">
                <section className="manju-asset-detail__card">
                  <div className="manju-asset-detail__card-intro">
                    <h2 className="manju-asset-detail__card-title">环境信息</h2>
                  </div>
                  <div className="manju-asset-detail__fields manju-asset-detail__fields--1">
                    <label className="manju-asset-detail__field">
                      <span>地点</span>
                      <Input
                        value={detail.location ?? ""}
                        onChange={(e) =>
                          setDetailField("location", e.target.value)
                        }
                        placeholder="如 公司天台"
                      />
                    </label>
                    <label className="manju-asset-detail__field">
                      <span>时间</span>
                      <Input
                        value={detail.timeOfDay ?? ""}
                        onChange={(e) =>
                          setDetailField("timeOfDay", e.target.value)
                        }
                        placeholder="如 夜晚"
                      />
                    </label>
                    <label className="manju-asset-detail__field">
                      <span>天气</span>
                      <Input
                        value={detail.weather ?? ""}
                        onChange={(e) =>
                          setDetailField("weather", e.target.value)
                        }
                        placeholder="如 暴雨"
                      />
                    </label>
                    <div className="manju-asset-detail__field">
                      <span>场景类型</span>
                      <Select
                        value={detail.sceneType || undefined}
                        onValueChange={(v) => setDetailField("sceneType", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {SCENE_TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="manju-asset-detail__field">
                      <span>建筑风格</span>
                      <Input
                        value={detail.architecture ?? ""}
                        onChange={(e) =>
                          setDetailField("architecture", e.target.value)
                        }
                        placeholder="如 现代商业建筑"
                      />
                    </label>
                  </div>
                </section>

                <section className="manju-asset-detail__card">
                  <div className="manju-asset-detail__card-intro">
                    <h2 className="manju-asset-detail__card-title">
                      氛围与光照
                    </h2>
                  </div>
                  <div className="manju-asset-detail__fields manju-asset-detail__fields--1">
                    <label className="manju-asset-detail__field">
                      <span>光照</span>
                      <ManjuTextField
                        value={detail.lighting ?? ""}
                        onChange={(lighting) =>
                          setDetailField("lighting", lighting)
                        }
                        placeholder="主光、辅光、整体影调…"
                        minHeight={88}
                      />
                    </label>
                    <label className="manju-asset-detail__field">
                      <span>氛围</span>
                      <ManjuTextField
                        value={detail.atmosphere ?? ""}
                        onChange={(atmosphere) =>
                          setDetailField("atmosphere", atmosphere)
                        }
                        placeholder="如 压抑、冰冷、危险"
                        minHeight={72}
                      />
                    </label>
                  </div>
                </section>

                <section className="manju-asset-detail__card">
                  <div className="manju-asset-detail__card-intro">
                    <h2 className="manju-asset-detail__card-title">道具</h2>
                  </div>
                  <div className="manju-asset-detail__prop-add">
                    <Input
                      value={propDraft}
                      onChange={(e) => setPropDraft(e.target.value)}
                      placeholder="添加道具…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSceneProp();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="manju-asset-detail__prop-add-btn"
                      aria-label="添加道具"
                      onClick={addSceneProp}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  {sceneProps.length > 0 ? (
                    <div className="manju-asset-detail__prop-tags">
                      {sceneProps.map((p) => (
                        <span key={p} className="manju-asset-detail__prop-tag">
                          {p}
                          <button
                            type="button"
                            aria-label={`移除 ${p}`}
                            onClick={() =>
                              setDetailField(
                                "sceneProps",
                                sceneProps.filter((x) => x !== p),
                              )
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="manju-asset-detail__hint">
                      添加场景中出现的陈设道具标签
                    </p>
                  )}
                </section>
              </div>
            ) : null}

            {asset.kind === "character" ? (
              <section className="manju-asset-detail__card manju-asset-detail__card--wide">
                <div className="manju-asset-detail__card-intro">
                  <h2 className="manju-asset-detail__card-title">角色音频</h2>
                  <p className="manju-asset-detail__card-sub">
                    可选配置。可用文本描述音色，或上传 2–5
                    秒参考音频，供后续剧本分析与配音绑定。
                  </p>
                </div>
                <div className="manju-asset-detail__voice-grid">
                  <div
                    className={cn(
                      "manju-asset-detail__voice-pane",
                      voiceUseText && "is-on",
                    )}
                  >
                    <div className="manju-asset-detail__voice-head">
                      <label className="manju-asset-detail__voice-check">
                        <Checkbox
                          checked={voiceUseText}
                          onCheckedChange={(v) =>
                            setDetailField("voiceUseText", v === true)
                          }
                        />
                        <span>文本音色</span>
                      </label>
                      {voiceUseText && detail.voiceNote ? (
                        <button
                          type="button"
                          className="manju-asset-detail__icon-btn manju-asset-detail__icon-btn--ghost"
                          title="清空"
                          aria-label="清空文本音色"
                          onClick={() => setDetailField("voiceNote", "")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {voiceUseText ? (
                      <ManjuTextField
                        value={detail.voiceNote ?? ""}
                        onChange={(voiceNote) =>
                          setDetailField("voiceNote", voiceNote)
                        }
                        placeholder="冷静、笃定的年轻女性声音，磁性冷感…"
                        minHeight={110}
                      />
                    ) : (
                      <p className="manju-asset-detail__hint">勾选后填写音色描述</p>
                    )}
                  </div>

                  <div
                    className={cn(
                      "manju-asset-detail__voice-pane",
                      voiceUseAudio && "is-on",
                    )}
                  >
                    <div className="manju-asset-detail__voice-head">
                      <label className="manju-asset-detail__voice-check">
                        <Checkbox
                          checked={voiceUseAudio}
                          onCheckedChange={(v) =>
                            setDetailField("voiceUseAudio", v === true)
                          }
                        />
                        <span>音频音色</span>
                      </label>
                      {voiceUseAudio && detail.voiceAudioUrl ? (
                        <button
                          type="button"
                          className="manju-asset-detail__icon-btn manju-asset-detail__icon-btn--ghost"
                          title="移除"
                          aria-label="移除音频音色"
                          onClick={() =>
                            setDetailField("voiceAudioUrl", undefined)
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {voiceUseAudio ? (
                      detail.voiceAudioUrl ? (
                        <audio
                          className="manju-asset-detail__audio"
                          controls
                          src={detail.voiceAudioUrl}
                        />
                      ) : (
                        <div className="space-y-2">
                          <label className="manju-asset-detail__drop">
                            <Upload className="size-5 opacity-50" />
                            <span>点击或拖拽上传音频文件</span>
                            <em>支持 mp3 / wav，建议 2–5 秒</em>
                            <input
                              type="file"
                              accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadVoiceAudio(file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setVoiceTtsOpen(true)}
                            >
                              <Mic2 className="size-3.5" />
                              AI 配音
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setAudioLibOpen(true)}
                            >
                              <FolderOpen className="size-3.5" />
                              音频库
                            </Button>
                          </div>
                        </div>
                      )
                    ) : (
                      <p className="manju-asset-detail__hint">勾选后上传参考音频</p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "look" && asset.kind === "character" ? (
          <div className="manju-asset-detail__stack">
            <section className="manju-asset-detail__card manju-asset-detail__card--wide">
              <div className="manju-asset-detail__card-head">
                <div className="manju-asset-detail__card-title-row">
                  <span className="manju-asset-detail__title-ico">
                    <User className="size-3.5" />
                  </span>
                  <h2 className="manju-asset-detail__card-title">外观数据</h2>
                </div>
                {asset.kind === "character" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={fillLookFromDescription}
                    >
                      <Sparkles className="size-3.5" />
                      从描述填写
                    </Button>
                    {lookEditing ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setLookEditing(false);
                        toast.success("外观数据已保存");
                      }}
                    >
                      完成
                    </Button>
                    ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="manju-asset-detail__action"
                      onClick={() => setLookEditing(true)}
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </Button>
                    )}
                  </div>
                ) : null}
              </div>

              {asset.kind === "character" && lookEditing ? (
                <div className="manju-asset-detail__fields">
                  {LOOK_FIELDS.map(({ key, label, half }) => (
                    <label
                      key={key}
                      className={cn(
                        "manju-asset-detail__field",
                        !half && "manju-asset-detail__field--span2",
                      )}
                    >
                      <span>{label}</span>
                      {key === "height" || key === "weight" ? (
                        <Input
                          value={detail[key] ?? ""}
                          onChange={(e) => setDetailField(key, e.target.value)}
                          placeholder={label}
                        />
                      ) : (
                        <ManjuTextField
                          value={detail[key] ?? ""}
                          onChange={(v) => setDetailField(key, v)}
                          placeholder={label}
                          minHeight={72}
                        />
                      )}
                    </label>
                  ))}
                </div>
              ) : hasLookData ? (
                <div className="manju-asset-detail__look-grid">
                  {LOOK_FIELDS.map(({ key, label, half }) => (
                    <div
                      key={key}
                      className={cn(
                        "manju-asset-detail__look-cell",
                        !half && "manju-asset-detail__look-cell--full",
                      )}
                    >
                      <span>{label}</span>
                      <p>{detail[key]?.trim() || "—"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="manju-asset-detail__empty">
                  <FileUser className="size-12 opacity-30" />
                  <p className="manju-asset-detail__empty-title">暂无数据</p>
                  <p className="manju-asset-detail__hint">
                    点击右上角「编辑」补充身高、体态、发型等外观信息。
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "images" ? (
          <div className="manju-asset-detail__stack">
            {genOpen ? (
              <ManjuAssetGeneratePanel
                asset={asset}
                initialPrompt={
                  asset.description.trim() ||
                  buildAssetPrompt(asset, project.settings, project.assets)
                }
                defaultModelId={project.settings.imageModelId ?? ""}
                busy={busyGen}
                onClose={() => setGenOpen(false)}
                onGenerate={generateImage}
              />
            ) : (
              <section className="manju-asset-detail__card manju-asset-detail__card--wide">
                <div className="manju-asset-detail__card-head">
                  <div className="manju-asset-detail__card-title-row">
                    <span className="manju-asset-detail__title-ico">
                      <Images className="size-3.5" />
                    </span>
                    <h2 className="manju-asset-detail__card-title">
                      图片管理
                      <span className="manju-asset-detail__count">
                        共 {asset.imageUrl ? 1 : 0} 张
                      </span>
                    </h2>
                  </div>
                  <div className="manju-asset-detail__img-actions">
                    <ManjuLibraryImport
                      kind={asset.kind}
                      disabled={busy}
                      label="资产库"
                      className="manju-asset-detail__action"
                      onPick={({ assetId: libId, imageUrl, name }) => {
                        updateAsset(projectId, asset.id, {
                          imageUrl,
                          assetId: libId,
                          jobId: null,
                          status: "succeeded",
                          name: asset.name.trim() ? asset.name : name,
                        });
                        useManjuStore
                          .getState()
                          .markStepComplete(projectId, "assets");
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="manju-asset-detail__action"
                      disabled={busy}
                      onClick={openGenerate}
                    >
                      <Wand2 className="size-3.5" />
                      AI 生图
                    </Button>
                    <AssetRefUpload
                      disabled={busy}
                      label="上传图片"
                      className="manju-asset-detail__action"
                      onFile={(file) => void uploadImage(file)}
                    />
                    <button
                      type="button"
                      className="manju-asset-detail__icon-btn"
                      title="刷新"
                      aria-label="刷新"
                      onClick={() => toast.message("已刷新状态")}
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </div>
                </div>

                {busy && !asset.imageUrl ? (
                  <div className="manju-asset-detail__empty">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p>正在生成…</p>
                  </div>
                ) : asset.imageUrl ? (
                  <div className="manju-asset-detail__gallery">
                    <article className="manju-asset-detail__shot">
                      <PhotoView src={asset.imageUrl}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.imageUrl} alt={asset.name} />
                      </PhotoView>
                      <span className="manju-asset-detail__shot-tag">已选</span>
                    </article>
                  </div>
                ) : (
                  <div className="manju-asset-detail__empty">
                    <FolderOpen className="size-12 opacity-30" />
                    <p className="manju-asset-detail__empty-title">暂无图片</p>
                    <p className="manju-asset-detail__hint">
                      点击右上角的「上传」或「AI 生图」来添加第一张图片。
                    </p>
                  </div>
                )}
              </section>
            )}

            {asset.kind === "character" && !genOpen ? (
              <section className="manju-asset-detail__card manju-asset-detail__card--wide">
                <div className="manju-asset-detail__card-head">
                  <div className="manju-asset-detail__card-title-row">
                    <span className="manju-asset-detail__title-ico">
                      <Volume2 className="size-3.5" />
                    </span>
                    <h2 className="manju-asset-detail__card-title">音频管理</h2>
                  </div>
                  <div className="manju-asset-detail__img-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="manju-asset-detail__action"
                      onClick={() => setAudioLibOpen(true)}
                    >
                      <FolderOpen className="size-3.5" />
                      音频库
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="manju-asset-detail__action"
                      onClick={() => setVoiceTtsOpen(true)}
                    >
                      <Mic2 className="size-3.5" />
                      AI 配音
                    </Button>
                    <label className="inline-flex">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="manju-asset-detail__action"
                        asChild
                      >
                        <span>
                          <Upload className="size-3.5" />
                          上传音频
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadVoiceAudio(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="manju-asset-detail__icon-btn"
                      title="刷新"
                      aria-label="刷新"
                      onClick={() => toast.message("已刷新状态")}
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </div>
                </div>

                {detail.voiceAudioUrl ? (
                  <div className="manju-asset-detail__audio-row">
                    <audio controls src={detail.voiceAudioUrl} />
                  </div>
                ) : (
                  <div className="manju-asset-detail__empty manju-asset-detail__empty--sm">
                    <Volume2 className="size-10 opacity-30" />
                    <p className="manju-asset-detail__empty-title">暂无音频</p>
                    <p className="manju-asset-detail__hint">
                      可通过上传、音频库或 AI 配音添加角色参考音色。
                    </p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {asset.kind === "character" ? (
        <>
          <ManjuVoiceTtsDialog
            open={voiceTtsOpen}
            onOpenChange={setVoiceTtsOpen}
            projectId={projectId}
            asset={asset}
            detail={detail}
          />
          <ManjuAudioLibraryDialog
            open={audioLibOpen}
            onOpenChange={setAudioLibOpen}
            onPick={({ url }) => {
              updateAsset(projectId, asset.id, {
                detail: patchDetail(asset, {
                  voiceAudioUrl: url,
                  voiceUseAudio: true,
                }),
              });
            }}
          />
        </>
      ) : null}
    </JoyPhotoProvider>
  );
}
