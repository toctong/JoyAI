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
import type { QuickToolId } from "./lib/quick-tools";

export type QuickToolOption = {
  id: QuickToolId;
  label: string;
};

type Props = {
  open: boolean;
  options: QuickToolOption[];
  selected: QuickToolId[];
  onSelectedChange: (ids: QuickToolId[]) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ImageToolbarSettings({
  open,
  options,
  selected,
  onSelectedChange,
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
            勾选的会出现在节点工具条上（超出部分进「更多」）。信息、复制、删除固定显示。未勾选的可从右键菜单使用。
          </DialogDescription>
        </DialogHeader>

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
