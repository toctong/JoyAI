"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Briefcase,
  LayoutDashboard,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const groups = [
  {
    heading: "运营",
    items: [
      { href: "/", label: "概览", icon: LayoutDashboard },
      { href: "/jobs", label: "任务", icon: Briefcase },
    ],
  },
  {
    heading: "AI 配置",
    items: [
      { href: "/channels", label: "渠道", icon: Waypoints },
      { href: "/models", label: "模型", icon: Boxes },
    ],
  },
  {
    heading: "系统",
    items: [
      { href: "/users", label: "用户", icon: Users },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="搜索页面与功能…" />
      <CommandList>
        <CommandEmpty>没有匹配项</CommandEmpty>
        {groups.map((group, i) => (
          <div key={group.heading}>
            {i > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={group.heading}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`${group.heading} ${item.label}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
