"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { buildAdminQuery } from "@/shared/lib/admin-query";

type CatalogKind = "llm" | "image" | "video" | "audio";

type CatalogItem = {
  remoteId: string;
  name: string;
  kind: CatalogKind;
  description?: string;
  capabilities?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  tags?: string[];
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
  const [channelId, setChannelId] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [existingRemoteIds, setExistingRemoteIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [kindTab, setKindTab] = useState<CatalogKind | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const channel = channels.find((item) => item.id === channelId);

  useEffect(() => {
    if (!open) return;
    setChannelId(initialChannelId || channels[0]?.id || "");
    setKindTab("all");
    setQuery("");
    setSelected(new Set());
    setItems([]);
    setExistingRemoteIds(new Set());
  }, [open, initialChannelId, channels]);

  useEffect(() => {
    if (!open || !channelId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ items: { remoteId: string }[] }>(
          `/admin/models${buildAdminQuery({
            page: 1,
            pageSize: 500,
            channelId,
          })}`,
        );
        if (cancelled) return;
        setExistingRemoteIds(
          new Set((res.items ?? []).map((item) => item.remoteId)),
        );
      } catch {
        if (!cancelled) setExistingRemoteIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, channelId]);

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

  const existingOnChannel = existingRemoteIds;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindTab !== "all" && item.kind !== kindTab) return false;
      if (!q) return true;
      return (
        item.remoteId.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, kindTab, query]);

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

  function toggle(remoteId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(remoteId)) next.delete(remoteId);
      else next.add(remoteId);
      return next;
    });
  }

  function selectVisible(onlyNew: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) {
        if (onlyNew && existingOnChannel.has(item.remoteId)) continue;
        next.add(item.remoteId);
      }
      return next;
    });
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

  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="从目录添加模型"
      description="按渠道预设勾选入库；已存在的会更新能力，不会禁用未勾选项。"
      widthClassName="sm:max-w-[840px]"
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
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="h-8 rounded-md">
                <SelectValue placeholder="选择渠道" />
              </SelectTrigger>
              <SelectContent className="shadow-none">
                {channels.map((item) => (
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {KIND_TABS.map((tab) => (
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
              </button>
            ))}
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

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-md"
              onClick={() => selectVisible(true)}
            >
              全选未添加
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md"
              onClick={() => setSelected(new Set())}
            >
              清空选择
            </Button>
            <span className="ml-auto self-center text-[12px] text-muted-foreground">
              已选 {selected.size} · 目录 {items.length}
            </span>
          </div>

        {loading ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              加载目录…
            </p>
          ) : emptyCatalog ? (
            <div className="space-y-2 py-8 text-center text-[13px] text-muted-foreground">
              <p>该平台没有预设模型目录。</p>
              <p>请改用「手动新建」，或先在渠道页完成配置后再试。</p>
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              无匹配模型
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.kind} className="space-y-2">
                  <div className="text-[12px] font-medium text-muted-foreground">
                    {group.label} · {group.items.length}
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {group.items.map((item) => {
                      const exists = existingOnChannel.has(item.remoteId);
                      const checked = selected.has(item.remoteId);
                      return (
                        <li key={item.remoteId}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={() => toggle(item.remoteId)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] font-medium">
                                  {item.name}
                                </span>
                                {exists ? (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    已添加
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
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
      </div>
    </AdminDrawer>
  );
}
