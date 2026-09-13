"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlugin } from "./plugin-registry";
import "./plugins-market.css";

export function PluginDetailShell({
  pluginId,
  children,
}: {
  pluginId: string;
  children: React.ReactNode;
}) {
  const plugin = getPlugin(pluginId);

  return (
    <div className="joy-plugin-detail">
      <div className="joy-plugin-detail-inner">
        <Link href="/plugins" className="joy-plugin-back">
          <ArrowLeft className="h-3.5 w-3.5" />
          插件市场
        </Link>
        <header className="joy-plugin-detail-header">
          <h1 className="joy-plugin-detail-title">
            {plugin?.name ?? "插件"}
          </h1>
          {plugin?.description ? (
            <p className="joy-plugin-detail-desc">{plugin.description}</p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
