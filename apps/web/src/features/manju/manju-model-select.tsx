"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { BrandAvatar } from "@/components/admin/brand-avatar";
import {
  ComposerModelMenu,
  type ComposerModelOption,
} from "@/features/studio/composer-model-menu";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import "@/features/studio/creation-composer.css";

const AUTO = "__auto__";

type Props = {
  models: ComposerModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  placeholder?: string;
};

/** Searchable model dropdown with brand icons (漫剧默认模型). */
export function ManjuModelSelect({
  models,
  value,
  onChange,
  className,
  placeholder = "自动（渠道默认）",
}: Props) {
  const selectedId = value.trim() || AUTO;
  const selected = models.find((m) => m.id === selectedId);
  const label = selected?.name ?? placeholder;
  const icon = selected
    ? modelIconSrc({
        remoteId: selected.remoteId,
        name: selected.name,
      })
    : null;

  const leadingOption = useMemo<ComposerModelOption>(
    () => ({ id: AUTO, name: placeholder }),
    [placeholder],
  );

  return (
    <ComposerModelMenu
      models={models}
      selectedId={selectedId}
      onSelect={(id) => onChange(id === AUTO ? "" : id)}
      leadingOption={leadingOption}
      hideOtherVendor
      emptyLabel="暂无可用模型"
      searchPlaceholder="搜索模型…"
      contentClassName="manju-model-select-menu"
    >
      <button
        type="button"
        className={cn("manju-model-select-trigger", className)}
      >
        {icon ? (
          <BrandAvatar src={icon} label={label} size={20} rounded="md" />
        ) : (
          <span className="manju-model-select-trigger__ph" aria-hidden />
        )}
        <span className="manju-model-select-trigger__label">{label}</span>
        <ChevronDown className="manju-model-select-trigger__chevron" />
      </button>
    </ComposerModelMenu>
  );
}
