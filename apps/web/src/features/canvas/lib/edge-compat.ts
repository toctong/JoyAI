import type { CanvasNode, CanvasNodeType } from "@joyai/shared";

/** Media / text commonly used as generation inputs. */
const MEDIA_SOURCES = new Set<CanvasNodeType>([
  "image",
  "video",
  "panorama",
  "audio",
  "text",
]);

/**
 * Soft preference only — canvas edges are free to connect any → any.
 * Model / capability checks happen at generate time, not when wiring.
 */
export function preferredConnectTargetType(
  sources: CanvasNode[],
): CanvasNodeType | undefined {
  if (!sources.length) return undefined;
  const types = new Set(sources.map((n) => n.type));

  // Pure images / panoramas → video (multi-frame refs)
  if ([...types].every((t) => t === "image" || t === "panorama")) {
    return "video";
  }

  // Any media / text mix → prompt
  if ([...types].every((t) => MEDIA_SOURCES.has(t))) {
    return "prompt";
  }

  if ([...types].every((t) => t === "prompt")) {
    return "image";
  }

  return "prompt";
}
