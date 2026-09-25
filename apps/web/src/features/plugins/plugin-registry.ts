import type { PluginManifest } from "./types";

/** Client-side plugin catalog. */
export const PLUGIN_REGISTRY: PluginManifest[] = [];

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
