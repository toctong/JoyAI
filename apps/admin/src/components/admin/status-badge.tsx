import { Badge } from "@/components/ui/badge";

const JOB_STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  succeeded: { label: "成功", variant: "default" },
  failed: { label: "失败", variant: "destructive" },
  running: { label: "运行中", variant: "secondary" },
  polling: { label: "轮询中", variant: "secondary" },
  queued: { label: "排队", variant: "outline" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const item = JOB_STATUS[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "default" : "outline"}>
      {enabled ? "启用" : "停用"}
    </Badge>
  );
}
