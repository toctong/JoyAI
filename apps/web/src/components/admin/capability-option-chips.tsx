"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import {
  DURATION_PRESETS,
  MAX_REF_PRESETS,
  RATIO_OPTIONS,
  RESOLUTION_OPTIONS,
  SIZE_OPTIONS,
  normalizeRatios,
  normalizeResolutions,
  normalizeSize,
  normalizeSizes,
  type CapabilityOption,
} from "@joyai/shared";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CapChip,
  CapField,
  joinCsvList,
  parseCsvList,
} from "@/components/admin/model-capability-chips";

function optionLabel(
  options: ReadonlyArray<CapabilityOption>,
  value: string,
) {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Compact selected tags + searchable multi-select popover (not a chip wall). */
function MultiSelectDict({
  label,
  options,
  values,
  onChange,
  placeholder = "选择…",
  allowCustom,
  normalize,
}: {
  label: string;
  options: ReadonlyArray<CapabilityOption>;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
  normalize?: (raw: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const known = useMemo(
    () => new Set(options.map((o) => o.value)),
    [options],
  );
  const selected = new Set(values);

  function toggle(value: string) {
    if (selected.has(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  function addCustom() {
    const raw = customDraft.trim();
    if (!raw || !normalize) return;
    const v = normalize(raw);
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setCustomDraft("");
  }

  return (
    <CapField label={label} count={values.length}>
      <div className="space-y-1.5">
        {values.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {values.map((value) => (
              <CapChip
                key={value}
                pressed
                custom={!known.has(value)}
                title="移除"
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
              >
                <span>{optionLabel(options, value)}</span>
                <X className="ml-1 size-3 opacity-60" />
              </CapChip>
            ))}
          </div>
        ) : null}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-between rounded-lg px-2.5 text-[12px] font-normal text-muted-foreground"
            >
              <span className="truncate">
                {values.length > 0
                  ? `已选 ${values.length} 项 · 继续添加`
                  : placeholder}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0 shadow-none"
            align="start"
          >
            <Command>
              <CommandInput placeholder={`搜索${label}…`} className="h-9" />
              <CommandList>
                <CommandEmpty>无匹配项</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => {
                    const on = selected.has(opt.value);
                    return (
                      <CommandItem
                        key={opt.value}
                        value={`${opt.label} ${opt.value}`}
                        onSelect={() => toggle(opt.value)}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-3.5",
                            on ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="font-mono text-[12px]">
                          {opt.label}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {allowCustom && normalize ? (
              <div className="flex gap-1.5 border-t border-border p-2">
                <Input
                  className="h-8 rounded-lg font-mono text-[12px]"
                  placeholder="自定义，回车添加"
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0 rounded-lg px-2"
                  onClick={addCustom}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </CapField>
  );
}

function NumberSelect({
  label,
  presets,
  value,
  onChange,
  unit,
}: {
  label: string;
  presets: readonly number[];
  value: string;
  onChange: (next: string) => void;
  unit?: string;
}) {
  const current =
    value.trim() === ""
      ? "__none__"
      : Number.isFinite(Number(value))
        ? value.trim()
        : "__none__";
  const known = new Set(presets.map(String));
  const isCustom = current !== "__none__" && !known.has(current);

  return (
    <CapField label={label}>
      <Select
        value={isCustom ? "__custom__" : current}
        onValueChange={(v) => {
          if (v === "__none__") onChange("");
          else if (v !== "__custom__") onChange(v);
        }}
      >
        <SelectTrigger className="h-8 rounded-lg text-[12px]">
          <SelectValue placeholder="不限" />
        </SelectTrigger>
        <SelectContent className="shadow-none">
          <SelectItem value="__none__">不限</SelectItem>
          {presets.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
              {unit ? ` ${unit}` : ""}
            </SelectItem>
          ))}
          {isCustom ? (
            <SelectItem value="__custom__">
              自定义 · {current}
              {unit ? ` ${unit}` : ""}
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </CapField>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium tracking-tight">{title}</span>
        <div className="h-px flex-1 bg-border/70" />
      </div>
      {children}
    </div>
  );
}

/** Dict-backed fields: multi-select popovers + number selects (no option walls). */
export function ModelCapabilityOptionChips({
  resolutions,
  ratios,
  sizes,
  maxRefImages,
  maxRefVideos,
  maxRefAudios,
  maxDurationSec,
  onResolutionsChange,
  onRatiosChange,
  onSizesChange,
  onMaxRefImagesChange,
  onMaxRefVideosChange,
  onMaxRefAudiosChange,
  onMaxDurationSecChange,
}: {
  resolutions: string;
  ratios: string;
  sizes: string;
  maxRefImages: string;
  maxRefVideos: string;
  maxRefAudios: string;
  maxDurationSec: string;
  onResolutionsChange: (csv: string) => void;
  onRatiosChange: (csv: string) => void;
  onSizesChange: (csv: string) => void;
  onMaxRefImagesChange: (raw: string) => void;
  onMaxRefVideosChange: (raw: string) => void;
  onMaxRefAudiosChange: (raw: string) => void;
  onMaxDurationSecChange: (raw: string) => void;
}) {
  const resolutionValues = normalizeResolutions(parseCsvList(resolutions));
  const ratioValues = normalizeRatios(parseCsvList(ratios));
  const sizeValues = normalizeSizes(parseCsvList(sizes));

  return (
    <div className="space-y-4">
      <Section title="输出规格">
        <div className="grid gap-3 sm:grid-cols-2">
          <MultiSelectDict
            label="分辨率"
            options={RESOLUTION_OPTIONS}
            values={resolutionValues}
            placeholder="选择分辨率档…"
            onChange={(next) =>
              onResolutionsChange(joinCsvList(normalizeResolutions(next)))
            }
          />
          <MultiSelectDict
            label="画幅"
            options={RATIO_OPTIONS}
            values={ratioValues}
            placeholder="选择画幅比例…"
            onChange={(next) =>
              onRatiosChange(joinCsvList(normalizeRatios(next)))
            }
          />
        </div>
        <MultiSelectDict
          label="尺寸"
          options={SIZE_OPTIONS}
          values={sizeValues}
          placeholder="选择精确尺寸…"
          allowCustom
          normalize={normalizeSize}
          onChange={(next) =>
            onSizesChange(joinCsvList(normalizeSizes(next)))
          }
        />
      </Section>

      <Section title="参考与时长">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberSelect
            label="参考图"
            presets={MAX_REF_PRESETS}
            value={maxRefImages}
            onChange={onMaxRefImagesChange}
          />
          <NumberSelect
            label="参考视频"
            presets={MAX_REF_PRESETS}
            value={maxRefVideos}
            onChange={onMaxRefVideosChange}
          />
          <NumberSelect
            label="参考音频"
            presets={MAX_REF_PRESETS}
            value={maxRefAudios}
            onChange={onMaxRefAudiosChange}
          />
          <NumberSelect
            label="最长秒数"
            presets={DURATION_PRESETS}
            value={maxDurationSec}
            onChange={onMaxDurationSecChange}
            unit="秒"
          />
        </div>
      </Section>
    </div>
  );
}
