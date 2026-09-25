"use client";

import Link from "next/link";
import { ImageIcon, Palette, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLUGIN_REGISTRY } from "./plugin-registry";
import type { PluginManifest } from "./types";
import "./plugins-market.css";

const ICONS = {
  wallpaper: ImageIcon,
  sparkles: Sparkles,
  palette: Palette,
} as const;

export function PluginsMarket() {
  return (
    <div className="joy-plugins h-full overflow-y-auto">
      <div className="joy-plugins-inner">
        <header className="joy-plugins-header">
          <h1 className="joy-plugins-title">插件市场</h1>
          <p className="joy-plugins-desc">
            扩展 FrameRally 前台体验。每个插件独立配置，可随时开关或调整。
          </p>
        </header>

        <div className="joy-plugins-grid">
          {PLUGIN_REGISTRY.length === 0 ? (
            <p className="joy-plugins-desc">暂无可用插件</p>
          ) : (
            PLUGIN_REGISTRY.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginManifest }) {
  const Icon = ICONS[plugin.icon];
  const disabled = plugin.status === "coming_soon";

  const body = (
    <>
      <div className="joy-plugin-card-top">
        <span className="joy-plugin-icon">
          <Icon className="h-5 w-5" />
        </span>
        {plugin.status === "available" ? (
          <Badge variant="secondary">可用</Badge>
        ) : (
          <Badge variant="outline">即将推出</Badge>
        )}
      </div>
      <div>
        <h2 className="joy-plugin-card-title">{plugin.name}</h2>
        <p className="joy-plugin-card-desc">{plugin.description}</p>
      </div>
      <div className="joy-plugin-tags">
        {plugin.tags.map((tag) => (
          <span key={tag} className="joy-plugin-tag">
            {tag}
          </span>
        ))}
      </div>
    </>
  );

  if (disabled) {
    return (
      <div className="joy-plugin-card is-disabled" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link href={plugin.href} className="joy-plugin-card">
      {body}
    </Link>
  );
}
