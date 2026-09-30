"use client";

import { useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { LayoutGrid, Search } from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  modelIconSrc,
  modelVendorLabel,
} from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { durationsFromCapabilities } from "./model-options";

export type ComposerModelOption = {
  id: string;
  name: string;
  kind?: string;
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: {
    id?: string;
    platform?: string;
    name?: string;
  };
};

type VendorGroup = {
  key: string;
  label: string;
  items: ComposerModelOption[];
  icon: string | null;
};

const ALL_KEY = "__all__";

function modelMatchesQuery(m: ComposerModelOption, q: string) {
  if (!q) return true;
  const hay = [
    m.name,
    m.remoteId ?? "",
    m.channel?.name ?? "",
    m.channel?.platform ?? "",
    modelVendorLabel(m) ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function groupModelsByVendor(models: ComposerModelOption[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();
  for (const m of models) {
    const label =
      modelVendorLabel(m)?.trim() ||
      m.channel?.name?.trim() ||
      "其他";
    const key = label;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label,
        items: [],
        icon: modelIconSrc(m),
      };
      map.set(key, group);
    }
    group.items.push(m);
    if (!group.icon) group.icon = modelIconSrc(m);
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "zh"),
  );
}

function durationMeta(m: ComposerModelOption): string | null {
  if (m.kind && m.kind !== "video") return null;
  const caps = m.capabilities;
  if (!caps) return null;

  if (caps.durationOptions?.length) {
    const list = durationsFromCapabilities(caps);
    if (!list.length) return null;
    const min = list[0]!;
    const max = list[list.length - 1]!;
    return min === max ? `${min}s` : `${min}s-${max}s`;
  }

  const min =
    typeof caps.minDurationSec === "number" &&
    Number.isFinite(caps.minDurationSec) &&
    caps.minDurationSec > 0
      ? caps.minDurationSec
      : null;
  const max =
    typeof caps.maxDurationSec === "number" &&
    Number.isFinite(caps.maxDurationSec) &&
    caps.maxDurationSec > 0
      ? caps.maxDurationSec
      : null;

  if (min != null && max != null) {
    return min === max ? `${min}s` : `${min}s-${max}s`;
  }
  if (max != null) return `≤${max}s`;
  if (min != null) return `≥${min}s`;
  return null;
}

function vendorKeyForModel(m: ComposerModelOption | undefined) {
  if (!m) return ALL_KEY;
  return (
    modelVendorLabel(m)?.trim() ||
    m.channel?.name?.trim() ||
    "其他"
  );
}

type Props = {
  models: ComposerModelOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** Extra props for menu content (e.g. canvas shortcut ignore). */
  contentProps?: ComponentPropsWithoutRef<typeof DropdownMenuContent> &
    Record<`data-${string}`, string | boolean | undefined>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
  /** Pinned option at top of the model list (e.g. 自动), not shown as a vendor category. */
  leadingOption?: ComposerModelOption | null;
  /** Hide the leftover “其他” vendor bucket on the left. */
  hideOtherVendor?: boolean;
};

/**
 * Cascading model picker: vendor categories (left) → models (right).
 */
export function ComposerModelMenu({
  models,
  selectedId,
  onSelect,
  children,
  align = "start",
  contentClassName,
  contentProps,
  open: openProp,
  onOpenChange,
  emptyLabel = "暂无可用模型",
  searchPlaceholder = "搜索模型…",
  leadingOption = null,
  hideOtherVendor = false,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>(ALL_KEY);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => modelMatchesQuery(m, q));
  }, [models, query]);

  const leadingVisible = useMemo(() => {
    if (!leadingOption) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return modelMatchesQuery(leadingOption, q);
  }, [leadingOption, query]);

  const groups = useMemo(() => {
    const list = groupModelsByVendor(filtered);
    return hideOtherVendor ? list.filter((g) => g.key !== "其他") : list;
  }, [filtered, hideOtherVendor]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (leadingOption && selectedId === leadingOption.id) {
      setActiveKey(ALL_KEY);
      return;
    }
    const selected = models.find((m) => m.id === selectedId);
    const key = vendorKeyForModel(selected);
    setActiveKey(hideOtherVendor && key === "其他" ? ALL_KEY : key);
  }, [open, selectedId, models, leadingOption, hideOtherVendor]);

  useEffect(() => {
    if (activeKey === ALL_KEY) return;
    if (!groups.some((g) => g.key === activeKey)) {
      setActiveKey(groups[0]?.key ?? ALL_KEY);
    }
  }, [groups, activeKey]);

  const rightItems = useMemo(() => {
    if (activeKey === ALL_KEY) return filtered;
    if (hideOtherVendor && activeKey === "其他") return filtered;
    return groups.find((g) => g.key === activeKey)?.items ?? [];
  }, [activeKey, filtered, groups, hideOtherVendor]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        {...contentProps}
        className={cn("joy-composer-model-menu", contentClassName)}
        onCloseAutoFocus={(e) => {
          contentProps?.onCloseAutoFocus?.(e);
          e.preventDefault();
        }}
      >
        <div className="joy-composer-model-cascade">
          <div className="joy-composer-model-primary">
            <div
              className="joy-composer-model-search"
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Search className="joy-composer-model-search-icon" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                autoFocus
              />
            </div>

            <div className="joy-composer-model-primary-list">
              {models.length === 0 ? (
                <div className="joy-composer-model-empty">{emptyLabel}</div>
              ) : filtered.length === 0 ? (
                <div className="joy-composer-model-empty">无匹配模型</div>
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(
                      "joy-composer-model-cat",
                      activeKey === ALL_KEY && "is-active",
                    )}
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveKey(ALL_KEY)}
                    onFocus={() => setActiveKey(ALL_KEY)}
                    onClick={() => setActiveKey(ALL_KEY)}
                  >
                    <span className="joy-composer-model-cat-icon is-grid">
                      <LayoutGrid className="size-4" />
                    </span>
                    <span className="joy-composer-model-cat-text">
                      <span className="joy-composer-model-cat-name">
                        全部模型
                      </span>
                      <span className="joy-composer-model-cat-count">
                        {filtered.length} 个模型
                      </span>
                    </span>
                  </button>

                  {groups.map((group) => (
                    <button
                      type="button"
                      key={group.key}
                      className={cn(
                        "joy-composer-model-cat",
                        activeKey === group.key && "is-active",
                      )}
                      onPointerDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveKey(group.key)}
                      onFocus={() => setActiveKey(group.key)}
                      onClick={() => setActiveKey(group.key)}
                    >
                      <BrandAvatar
                        src={group.icon}
                        label={group.label}
                        size={28}
                        rounded="md"
                      />
                      <span className="joy-composer-model-cat-text">
                        <span className="joy-composer-model-cat-name">
                          {group.label}
                        </span>
                        <span className="joy-composer-model-cat-count">
                          {group.items.length} 个模型
                        </span>
                      </span>
                      <span className="joy-composer-model-cat-chevron" aria-hidden>
                        ›
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {(models.length > 0 && filtered.length > 0) || leadingVisible ? (
            <div className="joy-composer-model-secondary">
              {leadingVisible && leadingOption && activeKey === ALL_KEY ? (
                <DropdownMenuItem
                  key={leadingOption.id}
                  className={cn(
                    "joy-composer-model-item",
                    selectedId === leadingOption.id && "is-selected",
                  )}
                  onClick={() => onSelect(leadingOption.id)}
                >
                  <span className="joy-composer-model-item-text">
                    <span className="joy-composer-model-item-name">
                      {leadingOption.name}
                    </span>
                  </span>
                </DropdownMenuItem>
              ) : null}
              {rightItems.map((m) => {
                const selected = m.id === selectedId;
                const meta = durationMeta(m);
                return (
                  <DropdownMenuItem
                    key={m.id}
                    className={cn(
                      "joy-composer-model-item",
                      selected && "is-selected",
                    )}
                    onClick={() => onSelect(m.id)}
                  >
                    <BrandAvatar
                      src={modelIconSrc(m)}
                      label={m.name}
                      size={22}
                      rounded="md"
                    />
                    <span className="joy-composer-model-item-text">
                      <span className="joy-composer-model-item-name">
                        {m.name}
                      </span>
                      {m.channel?.name ? (
                        <span className="joy-composer-model-item-id">
                          {m.channel.name}
                        </span>
                      ) : m.remoteId ? (
                        <span className="joy-composer-model-item-id">
                          {m.remoteId}
                        </span>
                      ) : null}
                    </span>
                    {meta ? (
                      <span className="joy-composer-model-item-meta">
                        {meta}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
