"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { QuickToolId } from "./lib/quick-tools";

export type QuickToolOption = {
  id: QuickToolId;
  label: string;
};

type Props = {
  open: boolean;
  options: QuickToolOption[];
  selected: QuickToolId[];
  showLabels: boolean;
  onSelectedChange: (ids: QuickToolId[]) => void;
  onShowLabelsChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ImageToolbarSettings({
  open,
  options,
  selected,
  showLabels,
  onSelectedChange,
  onShowLabelsChange,
  onClose,
  onSave,
}: Props) {
  const picked = new Set(selected);

  function toggle(id: QuickToolId, checked: boolean) {
    const next = new Set(picked);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(
      options.filter((item) => next.has(item.id)).map((item) => item.id),
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-canvas-shortcuts-ignore
        className="max-w-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>快捷工具</DialogTitle>
          <DialogDescription>
            勾选的会出现在节点工具条上（超出部分进「更多」）。编辑类工具固定在「编辑」菜单；信息、复制、删除固定显示。
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
          <span>显示按钮文字</span>
          <Switch checked={showLabels} onCheckedChange={onShowLabelsChange} />
        </label>

        <div className="max-h-[50vh] overflow-auto rounded-md border">
          {options.map((item) => {
            const on = picked.has(item.id);
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/60"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(value) => toggle(item.id, value === true)}
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={onSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
