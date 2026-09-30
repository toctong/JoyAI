"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Loader2, Mic2, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminAudioPlayer } from "@/components/admin/admin-audio-player";
import { staticAssetUrl } from "@/shared/lib/static-asset";

export type VoiceRow = {
  id: string;
  slug: string;
  label: string;
  voiceId: string;
  channelId?: string | null;
  channelName?: string | null;
  channelPlatform?: string | null;
  provider: string;
  gender: string | null;
  language: string | null;
  category: string;
  description: string | null;
  sampleText: string | null;
  previewAudioUrl: string | null;
  enabled: boolean;
  builtin: boolean;
  sortOrder: number;
  updatedAt: string;
  resolvedModel?: {
    id: string;
    name: string;
    remoteId: string;
    channelName: string;
    channelId?: string;
  } | null;
};

export function normalizeGenderLabel(raw?: string | null) {
  const g = raw?.trim();
  if (!g) return "";
  const key = g.toLowerCase();
  if (key === "male" || g === "男") return "男";
  if (key === "female" || g === "女") return "女";
  if (
    key === "neutral" ||
    g === "中性" ||
    g === "其他" ||
    g === "未知"
  ) {
    return "其他";
  }
  return g;
}

function resolveAudio(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

export type VoiceTableUi = {
  selectedIds: string[];
  pageIds: string[];
  previewingIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  onTogglePage: (checked: boolean) => void;
  onPreview: (voice: VoiceRow) => void;
  onEdit: (voice: VoiceRow) => void;
  onRemove: (voice: VoiceRow) => void;
};

const VoiceTableUiContext = createContext<VoiceTableUi | null>(null);

export function VoiceTableUiProvider({
  value,
  children,
}: {
  value: VoiceTableUi;
  children: ReactNode;
}) {
  return (
    <VoiceTableUiContext.Provider value={value}>
      {children}
    </VoiceTableUiContext.Provider>
  );
}

function useVoiceTableUi() {
  const ctx = useContext(VoiceTableUiContext);
  if (!ctx) {
    throw new Error("VoiceTableUiProvider 缺失");
  }
  return ctx;
}

function SelectAllCheckbox() {
  const { pageIds, selectedIds, onTogglePage } = useVoiceTableUi();
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected =
    pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;
  return (
    <Checkbox
      checked={
        allPageSelected ? true : somePageSelected ? "indeterminate" : false
      }
      onCheckedChange={(v) => onTogglePage(v === true)}
      aria-label="全选本页"
    />
  );
}

function RowCheckbox({ voice }: { voice: VoiceRow }) {
  const { selectedIds, onToggle } = useVoiceTableUi();
  return (
    <Checkbox
      checked={selectedIds.includes(voice.id)}
      onCheckedChange={(v) => onToggle(voice.id, v === true)}
      aria-label={`选择 ${voice.label}`}
    />
  );
}

function PreviewCell({ voice }: { voice: VoiceRow }) {
  const audioSrc = voice.previewAudioUrl
    ? resolveAudio(voice.previewAudioUrl)
    : "";
  if (!audioSrc) {
    return (
      <span className="text-[12px] text-muted-foreground">未生成</span>
    );
  }
  return <AdminAudioPlayer src={audioSrc} />;
}

function RowActions({ voice }: { voice: VoiceRow }) {
  const { previewingIds, onPreview, onEdit, onRemove } = useVoiceTableUi();
  const busy = previewingIds.includes(voice.id);
  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="生成试听"
        disabled={busy}
        onClick={() => onPreview(voice)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Mic2 className="size-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="编辑"
        onClick={() => onEdit(voice)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive"
        title="删除"
        onClick={() => onRemove(voice)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

/** 列定义保持引用稳定，勾选 / 试听中状态走 Context，避免整表重挂播放器 */
export const VOICE_COLUMNS: ColumnDef<VoiceRow, unknown>[] = [
  {
    id: "select",
    header: () => <SelectAllCheckbox />,
    size: 40,
    minSize: 40,
    enableSorting: false,
    cell: ({ row }) => <RowCheckbox voice={row.original} />,
    meta: { className: "w-10", cellClassName: "w-10" },
  },
  {
    id: "label",
    accessorKey: "label",
    header: "名称",
    size: 168,
    minSize: 140,
    cell: ({ row }) => {
      const voice = row.original;
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{voice.label}</span>
          <span className="truncate text-[12px] text-muted-foreground">
            {voice.slug}
          </span>
        </div>
      );
    },
  },
  {
    id: "voiceId",
    accessorKey: "voiceId",
    header: "voiceId",
    size: 220,
    minSize: 160,
    cell: ({ row }) => (
      <code className="block max-w-[240px] truncate text-[12px]">
        {row.original.voiceId}
      </code>
    ),
  },
  {
    id: "gender",
    accessorKey: "gender",
    header: "性别",
    size: 72,
    minSize: 64,
    cell: ({ row }) => {
      const genderLabel = normalizeGenderLabel(row.original.gender);
      return genderLabel ? (
        <Badge variant="outline" className="font-normal">
          {genderLabel}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    meta: { className: "whitespace-nowrap", cellClassName: "whitespace-nowrap" },
  },
  {
    id: "channel",
    accessorKey: "channelName",
    header: "渠道",
    size: 140,
    minSize: 120,
    cell: ({ row }) => {
      const name =
        row.original.channelName ||
        row.original.resolvedModel?.channelName ||
        null;
      if (!name) {
        return (
          <span className="text-[12px] text-muted-foreground">未绑定</span>
        );
      }
      return (
        <Badge variant="secondary" className="whitespace-nowrap font-normal">
          {name}
        </Badge>
      );
    },
    meta: { className: "whitespace-nowrap" },
  },
  {
    id: "model",
    header: "对应模型",
    size: 180,
    minSize: 160,
    cell: ({ row }) => {
      const model = row.original.resolvedModel;
      if (!model) {
        return (
          <span className="text-[12px] text-muted-foreground">
            未匹配音频模型
          </span>
        );
      }
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm leading-tight">{model.name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {model.remoteId}
          </span>
        </div>
      );
    },
  },
  {
    id: "category",
    accessorKey: "category",
    header: "分类",
    size: 80,
    minSize: 72,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.category}
      </span>
    ),
    meta: { className: "whitespace-nowrap" },
  },
  {
    id: "preview",
    header: "试听",
    size: 220,
    minSize: 200,
    cell: ({ row }) => <PreviewCell voice={row.original} />,
  },
  {
    id: "enabled",
    accessorKey: "enabled",
    header: "状态",
    size: 80,
    minSize: 72,
    cell: ({ row }) =>
      row.original.enabled ? (
        <Badge variant="secondary">启用</Badge>
      ) : (
        <Badge variant="outline">停用</Badge>
      ),
    meta: { className: "whitespace-nowrap" },
  },
  {
    id: "actions",
    header: "操作",
    size: 120,
    minSize: 120,
    enableSorting: false,
    meta: {
      stickyRight: true,
      className: "w-[120px]",
      cellClassName: "text-right",
    },
    cell: ({ row }) => <RowActions voice={row.original} />,
  },
];

export { resolveAudio };
