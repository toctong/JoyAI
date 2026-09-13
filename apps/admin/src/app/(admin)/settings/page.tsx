"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  ListPageCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/admin/list-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Setting = { key: string; value: unknown };

const TOS_KEYS = [
  { key: "tos.accessKey", label: "Access Key", secret: true },
  { key: "tos.secretKey", label: "Secret Key", secret: true },
  { key: "tos.endpoint", label: "Endpoint" },
  { key: "tos.region", label: "Region" },
  { key: "tos.bucket", label: "Bucket" },
  { key: "tos.publicBaseUrl", label: "Public Base URL" },
] as const;

function asString(v: unknown) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [tos, setTos] = useState<Record<string, string>>({});
  const [rawKey, setRawKey] = useState("");
  const [rawValue, setRawValue] = useState("{}");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const list = await api<Setting[]>("/admin/settings");
    setSettings(list);
    const map: Record<string, string> = {};
    for (const item of TOS_KEYS) {
      const found = list.find((s) => s.key === item.key);
      map[item.key] = asString(found?.value);
    }
    setTos(map);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveKey(key: string, value: unknown) {
    await api("/admin/settings", {
      method: "PUT",
      body: { key, value },
    });
  }

  async function saveTos() {
    setSaving(true);
    try {
      for (const item of TOS_KEYS) {
        const val = tos[item.key]?.trim() ?? "";
        if (val) await saveKey(item.key, val);
      }
      toast.success("TOS 设置已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveRaw() {
    let parsed: unknown = rawValue;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      /* string */
    }
    try {
      await saveKey(rawKey.trim(), parsed);
      toast.success("已保存");
      setRawKey("");
      setRawValue("{}");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="设置"
          description="系统配置 · NewAPI 风格分区"
          className="mb-0"
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void load()}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          }
        />
      </ListPageHeader>

      <Tabs defaultValue="tos" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="tos">对象存储 TOS</TabsTrigger>
          <TabsTrigger value="raw">高级键值</TabsTrigger>
          <TabsTrigger value="all">全部配置</TabsTrigger>
        </TabsList>

        <TabsContent value="tos" className="mt-4">
          <ListPageCard className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              也可继续使用环境变量 <code className="text-xs">TOS_*</code>
              ；此处写入便于运营热更新（服务端需已读 Settings）。
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {TOS_KEYS.map((item) => (
                <div key={item.key} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {item.label}
                  </Label>
                  <Input
                    className="h-8 font-mono text-xs"
                    type={item.secret ? "password" : "text"}
                    value={tos[item.key] ?? ""}
                    onChange={(e) =>
                      setTos((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                    placeholder={item.key}
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                size="sm"
                className="h-8"
                disabled={saving}
                onClick={() => void saveTos()}
              >
                <Save className="size-3.5" />
                保存 TOS
              </Button>
            </div>
          </ListPageCard>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <ListPageCard className="max-w-xl p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  className="h-8 font-mono text-xs"
                  value={rawKey}
                  onChange={(e) => setRawKey(e.target.value)}
                  placeholder="feature.flags"
                />
              </div>
              <div className="space-y-2">
                <Label>Value（JSON 或字符串）</Label>
                <Textarea
                  rows={6}
                  className="font-mono text-xs"
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!rawKey.trim()}
                onClick={() => void saveRaw()}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
          </ListPageCard>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <ListPageCard className="p-4">
            <div className="space-y-2">
              {settings.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <p className="font-mono text-sm text-primary">{item.key}</p>
                  <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
                    {JSON.stringify(item.value, null, 2)}
                  </pre>
                </div>
              ))}
              {settings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无设置
                </p>
              ) : null}
            </div>
          </ListPageCard>
        </TabsContent>
      </Tabs>
    </ListPageShell>
  );
}
