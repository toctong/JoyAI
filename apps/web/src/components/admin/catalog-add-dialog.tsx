"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getCatalogForPlatform } from "@joyai/shared";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminDrawer } from "@/components/admin/admin-drawer";
import { cn } from "@/shared/lib/utils";
import { api } from "@/shared/lib/api";

type CatalogKind = "llm" | "image" | "video" | "audio";

type CatalogItem = {
  remoteId: string;
  name: string;
  kind: CatalogKind;
  description?: string;
  capabilities?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  tags?: string[];
  isDefault?: boolean;
};

type ChannelOption = {
  id: string;
  name: string;
  platform?: string;
};

const KIND_TABS: { id: CatalogKind | "all"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "llm", label: "对话" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

function channelHasCatalog(platform?: string) {
  if (!platform) return false;
  return getCatalogForPlatform(platform).length > 0;
}

export function CatalogAddDialog({
  open,
  onOpenChange,
  channels,
  initialChannelId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: ChannelOption[];
  initialChannelId?: string;
  onImported: () => void;
}) {
  const catalogChannels = useMemo(
    () => channels.filter((item) => channelHasCatalog(item.platform)),
    [channels],
  );

  const [channelId, setChannelId] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [existingRemoteIds, setExistingRemoteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [kindTab, setKindTab] = useState<CatalogKind | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const channel = catalogChannels.find((item) => item.id === channelId);

  // Reset when drawer opens.
  useEffect(() => {
    if (!open) return;
    const preferred =
      (initialChannelId &&
        catalogChannels.some((item) => item.id === initialChannelId) &&
        initialChannelId) ||
      catalogChannels[0]?.id ||
      "";
    setChannelId(preferred);
    setKindTab("all");
    setQuery("");
    setSelected(new Set());
    setItems([]);
    setExistingRemoteIds(new Set());
  }, [open, initialChannelId, catalogChannels]);

  // Clear selection when switching channel (not on initial open reset).
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setKindTab("all");
    setQuery("");
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only on channel switch

  // Load existing remoteIds (unpaginated).
  useEffect(() => {
    if (!open || !channelId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ remoteIds: string[] }>(
          `/admin/channels/${channelId}/model-remote-ids`,
        );
        if (cancelled) return;
        setExistingRemoteIds(new Set(res.remoteIds ?? []));
      } catch (error) {
        if (!cancelled) {
          setExistingRemoteIds(new Set());
          toast.error(
            error instanceof Error ? error.message : "加载已添加模型失败",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, channelId]);

  // Load catalog for platform.
  useEffect(() => {
    if (!open || !channel?.platform) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api<{ items?: CatalogItem[]; models?: CatalogItem[] }>(
          `/admin/models/catalog?platform=${encodeURIComponent(channel.platform!)}`,
        );
        if (cancelled) return;
        setItems(res.items ?? res.models ?? []);
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          toast.error(error instanceof Error ? error.message : "加载目录失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, channel]);

  /** Already-imported models stay out of the picker. */
  const availableItems = useMemo(
    () => items.filter((item) => !existingRemoteIds.has(item.remoteId)),
    [items, existingRemoteIds],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<CatalogKind | "all", number> = {
      all: availableItems.length,
      llm: 0,
      image: 0,
      video: 0,
      audio: 0,
    };
    for (const item of availableItems) counts[item.kind] += 1;
    return counts;
  }, [availableItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableItems.filter((item) => {
      if (kindTab !== "all" && item.kind !== kindTab) return false;
      if (!q) return true;
      return (
        item.remoteId.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [availableItems, kindTab, query]);

  const grouped = useMemo(() => {
    const map = new Map<CatalogKind, CatalogItem[]>();
    for (const item of filtered) {
      const list = map.get(item.kind) ?? [];
      list.push(item);
      map.set(item.kind, list);
    }
    return KIND_TABS.filter((tab) => tab.id !== "all")
      .map((tab) => ({
        kind: tab.id as CatalogKind,
        label: tab.label,
        items: map.get(tab.id as CatalogKind) ?? [],
      }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  const visibleIds = useMemo(
    () => filtered.map((item) => item.remoteId),
    [filtered],
  );
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;

  function toggle(remoteId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(remoteId)) next.delete(remoteId);
      else next.add(remoteId);
      return next;
    });
  }

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleVisible() {
    setMany(visibleIds, !allVisibleSelected);
  }

  function toggleGroup(groupIds: string[]) {
    const allOn = groupIds.every((id) => selected.has(id));
    setMany(groupIds, !allOn);
  }

  async function handleImport() {
    if (!channelId || selected.size === 0) return;
    setImporting(true);
    try {
      const res = await api<{ created: number; updated: number }>(
        `/admin/channels/${channelId}/import-catalog-select`,
        {
          method: "POST",
          body: { remoteIds: Array.from(selected) },
        },
      );
      toast.success(`已添加 ${res.created} 个，更新 ${res.updated} 个`);
      onOpenChange(false);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  const emptyCatalog = !loading && items.length === 0;
  const allImported =
    !loading && items.length > 0 && availableItems.length === 0;
  const existingCount = items.length - availableItems.length;

  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="从目录添加模型"
      description="只列出尚未入库的目录模型；勾选后写入当前渠道。"
      widthClassName="sm:max-w-[880px]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-md"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-8 rounded-md"
            disabled={!channelId || selected.size === 0 || importing}
            onClick={() => void handleImport()}
          >
            {importing ? "导入中…" : `添加选中 (${selected.size})`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>渠道</Label>
          {catalogChannels.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">
              暂无带预设目录的渠道。请先在渠道页创建阿里云百炼 / 火山引擎等平台渠道。
            </p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="h-8 rounded-md">
                <SelectValue placeholder="选择渠道" />
              </SelectTrigger>
              <SelectContent className="shadow-none">
                {catalogChannels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.platform ? (
                      <span className="ml-2 text-muted-foreground">
                        ({item.platform})
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {KIND_TABS.map((tab) => {
            const count = kindCounts[tab.id];
            if (tab.id !== "all" && count === 0) return null;
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "h-7 rounded-md border px-2.5 text-[12px] transition-colors",
                  kindTab === tab.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setKindTab(tab.id)}
              >
                {tab.label}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 rounded-md pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称或 remoteId"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-md"
            disabled={visibleIds.length === 0}
            onClick={toggleVisible}
          >
            {allVisibleSelected ? "取消全选" : "全选"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md"
            disabled={selected.size === 0}
            onClick={() => setSelected(new Set())}
          >
            清空选择
          </Button>
          <span className="ml-auto self-center text-[12px] text-muted-foreground">
            已选 {visibleSelectedCount}/{filtered.length}
            {someVisibleSelected ? " · 部分" : ""}
            {existingCount > 0 ? ` · 已隐藏入库 ${existingCount}` : ""}
          </span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            加载目录…
          </p>
        ) : emptyCatalog ? (
          <div className="space-y-2 py-8 text-center text-[13px] text-muted-foreground">
            <p>该平台没有预设模型目录。</p>
            <p>请改用「手动新建」，或切换到百炼 / 火山等有目录的渠道。</p>
          </div>
        ) : allImported ? (
          <div className="space-y-2 py-8 text-center text-[13px] text-muted-foreground">
            <p>该渠道目录模型已全部入库。</p>
            <p>如需改能力，请在模型列表中编辑；新目录模型上线后会显示在这里。</p>
          </div>
        ) : grouped.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            无匹配模型
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => {
              const groupIds = group.items.map((item) => item.remoteId);
              const groupSelected = groupIds.filter((id) => selected.has(id));
              const groupAllOn =
                groupIds.length > 0 &&
                groupSelected.length === groupIds.length;
              const groupPartial =
                groupSelected.length > 0 && !groupAllOn;
              return (
                <div key={group.kind} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={
                        groupAllOn
                          ? true
                          : groupPartial
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() => toggleGroup(groupIds)}
                      aria-label={`全选${group.label}`}
                    />
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {group.label} · {group.items.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {group.items.map((item) => {
                      const checked = selected.has(item.remoteId);
                      return (
                        <li key={item.remoteId}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40",
                              checked && "bg-primary/[0.04]",
                            )}
                            onClick={() => toggle(item.remoteId)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggle(item.remoteId);
                              }
                            }}
                          >
                            <Checkbox
                              className="mt-0.5 pointer-events-none"
                              checked={checked}
                              tabIndex={-1}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] font-medium">
                                  {item.name}
                                </span>
                                {item.isDefault ? (
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                    默认
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate font-mono text-[11px] text-muted-foreground">
                                {item.remoteId}
                              </div>
                              {item.description ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                                  {item.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminDrawer>
  );
}
