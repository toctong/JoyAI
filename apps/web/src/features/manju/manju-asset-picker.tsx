"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/lib/utils";
import type { ManjuAssetDraft } from "./manju-types";
import { assetDisplayLabel, assetRegistryName } from "./lib/asset-registry";

type Props = {
  assets: ManjuAssetDraft[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

/** 分镜挂资产：可搜索多选（cmdk） */
export function ManjuAssetPicker({
  assets,
  value,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  const sorted = useMemo(() => {
    return [...assets]
      .filter((a) => a.name.trim())
      .sort((a, b) =>
        assetRegistryName(a, assets).localeCompare(
          assetRegistryName(b, assets),
          "zh-CN",
        ),
      );
  }, [assets]);

  const summary =
    value.length === 0
      ? "选择出场资产"
      : value
          .map((id) => {
            const a = assets.find((x) => x.id === id);
            return a ? assetRegistryName(a, assets) : null;
          })
          .filter(Boolean)
          .join("、");

  if (assets.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between font-normal"
          >
            <span className="truncate text-left text-xs">{summary}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
          <Command>
            <CommandInput placeholder="搜索角色 / 场景 / 道具…" />
            <CommandList>
              <CommandEmpty>没有匹配资产</CommandEmpty>
              <CommandGroup>
                {sorted.map((a) => {
                  const on = selected.has(a.id);
                  return (
                    <CommandItem
                      key={a.id}
                      value={`${assetRegistryName(a, assets)} ${a.kind} ${(a.aliases ?? []).join(" ")}`}
                      onSelect={() => {
                        const next = on
                          ? value.filter((id) => id !== a.id)
                          : [...value, a.id];
                        onChange(next);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          on ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate text-xs">
                        {assetDisplayLabel(a, assets)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const a = assets.find((x) => x.id === id);
            if (!a) return null;
            return (
              <button
                key={id}
                type="button"
                className="manju-chip !px-2 !py-0.5 !text-[11px] manju-chip--active"
                onClick={() => onChange(value.filter((x) => x !== id))}
                title="点击移除"
              >
                {assetRegistryName(a, assets)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
