"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, RefreshCw, Save } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/shared/lib/utils";

type Setting = { key: string; value: unknown; fromEnv?: boolean };

const TOS_KEYS: Array<{ key: string; label: string; secret?: boolean }> = [
  { key: "tos.accessKey", label: "Access Key", secret: true },
  { key: "tos.secretKey", label: "Secret Key", secret: true },
  { key: "tos.endpoint", label: "Endpoint" },
  { key: "tos.region", label: "Region" },
  { key: "tos.bucket", label: "Bucket" },
  { key: "tos.publicBaseUrl", label: "Public Base URL" },
];

const EXPLORE_MARKET_PROXY_KEY = "explore.marketProxy";

const GITHUB_KEYS: Array<{ key: string; label: string; secret?: boolean }> = [
  { key: "github.owner", label: "Owner" },
  { key: "github.repo", label: "Repository" },
  { key: "github.token", label: "Token（repo 读权限）", secret: true },
];

function asString(v: unknown) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function SectionCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ListPageCard className="overflow-hidden p-0">
      <div className="border-b border-border/70 px-6 py-4">
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="space-y-4 px-6 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
          {footer}
        </div>
      ) : null}
    </ListPageCard>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [tos, setTos] = useState<Record<string, string>>({});
  const [github, setGithub] = useState<Record<string, string>>({});
  const [marketProxy, setMarketProxy] = useState("");
  const [rawKey, setRawKey] = useState("");
  const [rawValue, setRawValue] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeText, setProbeText] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<Setting[]>("/admin/settings");
      setSettings(list);
      const map: Record<string, string> = {};
      for (const item of TOS_KEYS) {
        const found = list.find((s) => s.key === item.key);
        map[item.key] = asString(found?.value);
      }
      setTos(map);
      const gh: Record<string, string> = {};
      for (const item of GITHUB_KEYS) {
        const found = list.find((s) => s.key === item.key);
        gh[item.key] = asString(found?.value);
      }
      setGithub(gh);
      const proxyRow = list.find((s) => s.key === EXPLORE_MARKET_PROXY_KEY);
      setMarketProxy(asString(proxyRow?.value));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载设置失败");
    }
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

  async function saveGithub() {
    setSaving(true);
    try {
      for (const item of GITHUB_KEYS) {
        const val = github[item.key]?.trim() ?? "";
        if (val) await saveKey(item.key, val);
      }
      toast.success("GitHub 设置已保存");
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
    <ListPageShell className="overflow-y-auto">
      <ListPageHeader>
        <PageHeader
          title="设置"
          description="对象存储、探索代理与 GitHub 更新源 · 写入库后可热更新，未配置时回填环境变量"
          className="mb-0"
          actions={
            <Button
              variant="outline"
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
            className="h-9 rounded-xl px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            对象存储
          </TabsTrigger>
          <TabsTrigger
            value="explore"
            className="h-9 rounded-xl px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            探索
          </TabsTrigger>
          <TabsTrigger
            value="github"
            className="h-9 rounded-xl px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            GitHub
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="h-9 rounded-xl px-3.5 data-[state=active]:bg-secondary data-[state=active]:shadow-none"
          >
            高级
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tos" className="mt-0">
          <SectionCard
            title="火山 TOS / 对象存储"
            description={
              <>
                未写入库时会回填环境变量{" "}
                <code className="font-mono text-[12px]">TOS_*</code>
                。保存后写入 Settings，便于运营热更新。
              </>
            }
            footer={
              <Button
                size="sm"
                className="h-9 rounded-xl"
                disabled={saving}
                onClick={() => void saveTos()}
              >
                <Save className="size-3.5" />
                保存 TOS
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {TOS_KEYS.map((item) => (
                <div key={item.key} className="space-y-2">
                  <Label>{item.label}</Label>
                  <Input
                    className="h-9 rounded-xl font-mono text-[13px]"
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
          </SectionCard>
        </TabsContent>

        <TabsContent value="explore" className="mt-0">
          <SectionCard
            title="探索市集代理"
            description={
              <>
                用于拉取 Elser / PixAI / Civitai。留空则直连；未入库时回填{" "}
                <code className="font-mono text-[12px]">
                  EXPLORE_MARKET_PROXY
                </code>
                。
              </>
            }
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  disabled={saving || probing}
                  onClick={() => void probeExplore()}
                >
                  <RefreshCw
                    className={cn("size-3.5", probing && "animate-spin")}
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
              </>
            }
          >
            <div className="space-y-2">
              <Label>市集出站代理（HTTP）</Label>
              <Input
                className="h-9 rounded-xl font-mono text-[13px]"
                value={marketProxy}
                onChange={(e) => setMarketProxy(e.target.value)}
                placeholder="http://127.0.0.1:7890"
              />
            </div>
            {probeText ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-border bg-muted/30 px-3 py-2 font-mono text-[12px] text-muted-foreground">
                {probeText}
              </pre>
            ) : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="github" className="mt-0">
          <SectionCard
            title="GitHub 更新源"
            description={
              <>
                侧栏更新日志用。私有仓需有{" "}
                <code className="font-mono text-[12px]">repo</code>{" "}
                读权限 Token。未写入库时回填{" "}
                <code className="font-mono text-[12px]">GITHUB_*</code>。
              </>
            }
            footer={
              <Button
                size="sm"
                className="h-9 rounded-xl"
                disabled={saving}
                onClick={() => void saveGithub()}
              >
                <Save className="size-3.5" />
                保存 GitHub
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {GITHUB_KEYS.map((item) => (
                <div
                  key={item.key}
                  className={
                    item.secret ? "space-y-2 sm:col-span-2" : "space-y-2"
                  }
                >
                  <Label>{item.label}</Label>
                  <Input
                    className="h-9 rounded-xl font-mono text-[13px]"
                    type={item.secret ? "password" : "text"}
                    value={github[item.key] ?? ""}
                    onChange={(e) =>
                      setGithub((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                    placeholder={item.key}
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="advanced" className="mt-0 space-y-4">
          <SectionCard
            title="自定义键值"
            description="写入任意 Settings 键。Value 优先按 JSON 解析，失败则存为字符串。"
            footer={
              <Button
                size="sm"
                className="h-9 rounded-xl"
                disabled={!rawKey.trim()}
                onClick={() => void saveRaw()}
              >
                <Save className="size-3.5" />
                保存键值
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  className="h-9 rounded-xl font-mono text-[13px]"
                  value={rawKey}
                  onChange={(e) => setRawKey(e.target.value)}
                  placeholder="feature.flags"
                />
              </div>
              <div className="space-y-2">
                <Label>Value（JSON 或字符串）</Label>
                <Textarea
                  rows={6}
                  className="rounded-xl font-mono text-[13px]"
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                />
              </div>
            </div>
          </SectionCard>

          <Collapsible open={allOpen} onOpenChange={setAllOpen}>
            <ListPageCard className="overflow-hidden p-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-muted/30"
                >
                  <div>
                    <div className="text-[15px] font-medium">全部配置</div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      只读查看当前生效的全部 Settings（含环境变量回填）
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      allOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 border-t border-border/70 px-6 py-4">
                  {settings.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-muted-foreground">
                      暂无设置
                    </p>
                  ) : (
                    settings.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-xl border border-border bg-muted/30 px-3 py-2"
                      >
                        <p className="font-mono text-[13px] text-primary">
                          {item.key}
                          {item.fromEnv ? (
                            <span className="ml-2 font-sans text-[12px] text-muted-foreground">
                              （来自 .env）
                            </span>
                          ) : null}
                        </p>
                        <ScrollArea className="max-h-48 w-full" type="hover">
                          <pre className="text-[12px] text-muted-foreground">
                            {JSON.stringify(item.value, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleContent>
            </ListPageCard>
          </Collapsible>
        </TabsContent>
      </Tabs>
    </ListPageShell>
  );
}
