"use client";

import { cn } from "@/shared/lib/utils";
import { Input } from "@/components/ui/input";

const MODALITY_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
] as const;

const FEATURE_OPTIONS = [
  { value: "chat", label: "对话" },
  { value: "vision", label: "看图" },
  { value: "video-input", label: "看视频" },
  { value: "reasoning", label: "推理" },
  { value: "tools", label: "工具" },
  { value: "omni", label: "全模态" },
  { value: "t2i", label: "文生图" },
  { value: "i2i", label: "图生图" },
  { value: "t2v", label: "文生视频" },
  { value: "i2v", label: "图生视频" },
  { value: "r2v", label: "参考生视频" },
  { value: "long-context", label: "长上下文" },
] as const;

export function parseCsvList(raw?: string) {
  return (raw ?? "")
    .split(/[,/，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinCsvList(values: string[]) {
  return values.filter(Boolean).join(",");
}

export function CapChip({
  pressed,
  children,
  onClick,
  className,
  title,
  custom,
}: {
  pressed?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  custom?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-[2px] border px-2 text-[12px] leading-none transition-colors",
        custom
          ? "border-dashed border-border bg-muted/60 text-foreground"
          : pressed
            ? "border-primary/50 bg-primary/10 text-foreground"
            : "border-transparent bg-muted text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CapField({
  label,
  count,
  children,
  className,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          {label}
        </span>
        {count != null && count > 0 ? (
          <span className="text-[11px] tabular-nums text-muted-foreground/80">
            已选 {count}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(values);
  function toggle(value: string) {
    if (selected.has(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }
  return (
    <CapField label={label} count={values.length}>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <CapChip
            key={opt.value}
            pressed={selected.has(opt.value)}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </CapChip>
        ))}
      </div>
    </CapField>
  );
}

/** Toggle chips for input/output modalities + common feature tags. */
export function ModelCapabilityChips({
  inputMods,
  outputMods,
  features,
  onInputChange,
  onOutputChange,
  onFeaturesChange,
}: {
  inputMods: string;
  outputMods: string;
  features: string;
  onInputChange: (csv: string) => void;
  onOutputChange: (csv: string) => void;
  onFeaturesChange: (csv: string) => void;
}) {
  const inputValues = parseCsvList(inputMods);
  const outputValues = parseCsvList(outputMods);
  const featureValues = parseCsvList(features);
  const knownFeatures = new Set<string>(
    FEATURE_OPTIONS.map((item) => item.value),
  );
  const customFeatures = featureValues.filter(
    (item) => !knownFeatures.has(item),
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChipGroup
          label="输入"
          options={MODALITY_OPTIONS}
          values={inputValues}
          onChange={(next) => onInputChange(joinCsvList(next))}
        />
        <ChipGroup
          label="输出"
          options={MODALITY_OPTIONS}
          values={outputValues}
          onChange={(next) => onOutputChange(joinCsvList(next))}
        />
      </div>
      <ChipGroup
        label="能力标签"
        options={FEATURE_OPTIONS}
        values={featureValues}
        onChange={(next) => {
          const preserved = customFeatures;
          const picked = next.filter((item) => knownFeatures.has(item));
          onFeaturesChange(joinCsvList([...picked, ...preserved]));
        }}
      />
      {customFeatures.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {customFeatures.map((tag) => (
            <CapChip
              key={tag}
              custom
              pressed
              title="点按移除"
              onClick={() =>
                onFeaturesChange(
                  joinCsvList(featureValues.filter((item) => item !== tag)),
                )
              }
            >
              {tag}
            </CapChip>
          ))}
        </div>
      ) : null}
      <Input
        className="h-8 rounded-lg text-[12px]"
        placeholder="其它标签，回车或逗号添加"
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== ",") return;
          e.preventDefault();
          const el = e.target as HTMLInputElement;
          const parts = parseCsvList(el.value);
          if (parts.length === 0) return;
          const next = [...featureValues];
          for (const p of parts) {
            if (!next.includes(p)) next.push(p);
          }
          onFeaturesChange(joinCsvList(next));
          el.value = "";
        }}
      />
    </div>
  );
}
