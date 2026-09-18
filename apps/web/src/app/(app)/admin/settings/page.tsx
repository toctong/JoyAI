"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "@/shared/lib/toast";
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
import { ScrollArea } from "@/components/ui/scroll-area";

type Setting = { key: string; value: unknown };

const TOS_KEYS: Array<{ key: string; label: string; secret?: boolean }> = [
  { key: "tos.accessKey", label: "Access Key", secret: true },
  { key: "tos.secretKey", label: "Secret Key", secret: true },
  { key: "tos.endpoint", label: "Endpoint" },
  { key: "tos.region", label: "Region" },
  { key: "tos.bucket", label: "Bucket" },
  { key: "tos.publicBaseUrl", label: "Public Base URL" },
];

const EXPLORE_MARKET_PROXY_KEY = "explore.marketProxy";

function asString(v: unknown) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [tos, setTos] = useState<Record<string, string>>({});
  const [marketProxy, setMarketProxy] = useState("");
  const [rawKey, setRawKey] = useState("");
  const [rawValue, setRawValue] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeText, setProbeText] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api<Setting[]>("/admin/settings");
    setSettings(list);
    const map: Record<string, string> = {};
    for (const item of TOS_KEYS) {
      const found = list.find((s) => s.key === item.key);
      map[item.key] = asString(found?.value);
    }
    setTos(map);
    const proxyRow = list.find((s) => s.key === EXPLORE_MARKET_PROXY_KEY);
    setMarketProxy(asString(proxyRow?.value));
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

  async function saveExplore() {
    setSaving(true);
    try {
      await saveKey(EXPLORE_MARKET_PROXY_KEY, marketProxy.trim());
      toast.success("探索代理已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function probeExplore() {
    setProbing(true);
    setProbeText(null);
    try {
      const result = await api<{
        proxy: string | null;
        ok: boolean;
        targets: Array<{
          id: string;
          label: string;
          ok: boolean;
          status: number | null;
          ms: number;
          error: string | null;
        }>;
      }>("/admin/settings/explore-market-proxy/probe", {
        method: "POST",
        body: { proxy: marketProxy.trim() || undefined },
      });
      const lines = result.targets.map((t) =>
        t.ok
          ? `${t.label}: OK (${t.status ?? "-"}, ${t.ms}ms)`
          : `${t.label}: FAIL (${t.error || t.status || "error"}, ${t.ms}ms)`,
      );
      const summary = [
        `代理: ${result.proxy || "（直连）"}`,
        ...lines,
      ].join("\n");
      setProbeText(summary);
      if (result.ok) toast.success("探活通过");
      else toast.error("探活未全部通过");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "探活失败");
    } finally {
      setProbing(false);
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
          description="系统配置"
          className="mb-0"
          actions={
            <Button
              variant="secondary"
              size="sm"
              className="h-9 rounded-xl"
              onClick={() => void load()}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          }
        />
      </ListPageHeader>

      <Tabs defaultValue="tos" className="space-y-4">
        <TabsList className="h-auto gap-1 bg-transparent p-0">
          <TabsTrigger
            value="tos"
            className="h-9 rounded-[10px] px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            对象存储 TOS
          </TabsTrigger>
          <TabsTrigger
            value="explore"
            className="h-9 rounded-[10px] px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            探索
          </TabsTrigger>
          <TabsTrigger
            value="raw"
            className="h-9 rounded-[10px] px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            高级键值
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="h-9 rounded-[10px] px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            全部配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tos" className="mt-0">
          <ListPageCard className="p-6">
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
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
                className="h-9 rounded-xl"
                disabled={saving}
                onClick={() => void saveTos()}
              >
                <Save className="size-3.5" />
                保存 TOS
              </Button>
            </div>
          </ListPageCard>
        </TabsContent>

        <TabsContent value="explore" className="mt-0">
          <ListPageCard className="max-w-xl p-6">
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              用于拉取 <strong>Elser</strong> / <strong>PixAI</strong> /{" "}
              <strong>Civitai</strong>{" "}
              探索上游。留空则直连（或回退环境变量{" "}
              <code className="text-xs">EXPLORE_MARKET_PROXY</code>）。
            </p>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                市集出站代理（HTTP）
              </Label>
              <Input
                className="h-8 font-mono text-xs"
                value={marketProxy}
                onChange={(e) => setMarketProxy(e.target.value)}
                placeholder="http://127.0.0.1:7890"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-xl"
                disabled={saving || probing}
                onClick={() => void probeExplore()}
              >
                <RefreshCw
                  className={`size-3.5 ${probing ? "animate-spin" : ""}`}
                />
                探活
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-xl"
                disabled={saving || probing}
                onClick={() => void saveExplore()}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
            {probeText ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {probeText}
              </pre>
            ) : null}
          </ListPageCard>
        </TabsContent>

        <TabsContent value="raw" className="mt-0">
          <ListPageCard className="max-w-xl p-6">
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
                className="h-9 rounded-xl"
                disabled={!rawKey.trim()}
                onClick={() => void saveRaw()}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
          </ListPageCard>
        </TabsContent>

        <TabsContent value="all" className="mt-0">
          <ListPageCard className="p-5">
            <div className="space-y-2">
              {settings.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <p className="font-mono text-sm text-primary">{item.key}</p>
                  <ScrollArea className="max-h-48 w-full" type="hover">
                    <pre className="text-xs text-muted-foreground">
                      {JSON.stringify(item.value, null, 2)}
                    </pre>
                  </ScrollArea>
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
