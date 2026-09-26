import type { ModelCapabilities } from "@joyai/shared";
import { inferImageProtocol } from "@joyai/shared";

export type InpaintModelLike = {
  id: string;
  name: string;
  kind?: string;
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { platform?: string; name?: string };
};

/**
 * Image models that can take a marked reference for erase / inpaint.
 * Prefer i2i / edits; fall back to any image model if catalog tags are missing.
 */
export function modelSupportsInpaint(model: InpaintModelLike): boolean {
  if (model.kind && model.kind !== "image") return false;
  const caps = model.capabilities ?? null;
  if (!caps) return true;

  const features = caps.features ?? [];
  if (
    features.some((f) =>
      /^(i2i|edit|inpaint|interactive-edit)$/i.test(String(f)),
    )
  ) {
    return true;
  }
  if ((caps.maxRefImages ?? 0) > 0) return true;
  if (caps.input?.includes("image")) return true;

  const remoteId = model.remoteId ?? "";
  if (/-edit$/i.test(remoteId) || /edit/i.test(remoteId)) return true;

  const protocol =
    caps.protocol ??
    inferImageProtocol(model.channel?.platform ?? "", remoteId);
  if (protocol.imagePath === "edits") return true;
  if (/edit/i.test(protocol.imageProfile ?? "")) return true;

  return false;
}

export function filterInpaintModels<T extends InpaintModelLike>(
  models: T[],
): T[] {
  const image = models.filter((m) => !m.kind || m.kind === "image");
  const capable = image.filter(modelSupportsInpaint);
  return capable.length > 0 ? capable : image;
}

/**
 * Default pick for studio dialogs: keep current if still valid, else
 * last remembered choice, else first in list.
 */
export function pickDefaultModelId<T extends InpaintModelLike>(
  models: T[],
  currentId?: string | null,
): string {
  if (!models.length) return "";
  const cur = currentId?.trim() || "";
  if (cur && models.some((m) => m.id === cur)) return cur;
  const last = readLastImageModelId();
  if (last && models.some((m) => m.id === last)) return last;
  return models[0]!.id;
}

const LAST_IMAGE_MODEL_KEY = "joy.canvas.lastImageModelId";

export function readLastImageModelId(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(localStorage.getItem(LAST_IMAGE_MODEL_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

/** Remember last picked image model across canvas studio dialogs. */
export function rememberImageModelId(id: string) {
  const next = id.trim();
  if (!next || typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_IMAGE_MODEL_KEY, next);
  } catch {
    /* ignore */
  }
}
