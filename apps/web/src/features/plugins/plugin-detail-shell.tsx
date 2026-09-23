"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlugin } from "./plugin-registry";
import "./plugins-market.css";

export function PluginDetailShell({
  pluginId,
  actions,
  children,
}: {
  pluginId: string;
  /** Right-side controls aligned with the title row */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const plugin = getPlugin(pluginId);

  return (
    <div className="joy-plugin-detail h-full min-h-0 overflow-y-auto">
      <div className="joy-plugin-detail-inner">
        <Link href="/admin/plugins" className="joy-plugin-back">
          <ArrowLeft className="h-3.5 w-3.5" />
          插件市场
        </Link>
        <header className="joy-plugin-detail-header">
          <div className="joy-plugin-detail-top">
            <div className="joy-plugin-detail-heading">
              <h1 className="joy-plugin-detail-title">
                {plugin?.name ?? "插件"}
              </h1>
              {plugin?.description ? (
                <p className="joy-plugin-detail-desc">{plugin.description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="joy-plugin-detail-actions">{actions}</div>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
