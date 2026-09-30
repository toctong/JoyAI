"use client";

import { Checkbox } from "@/components/ui/checkbox";

/** 表头：本页全选 */
export function AdminSelectAllCheckbox({
  allSelected,
  someSelected,
  onToggle,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      checked={
        allSelected ? true : someSelected ? "indeterminate" : false
      }
      onCheckedChange={(v) => onToggle(v === true)}
      aria-label="全选本页"
    />
  );
}
