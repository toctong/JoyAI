import { z } from "zod";

/**
 * Image request dialect for openai-images / compatible gateways.
 * Catalog may set `capabilities.protocol.imageProfile` explicitly;
 * runtime also infers from platform + remoteId when omitted.
 */
export const ImageProtocolProfileSchema = z.enum([
  /** Standard OpenAI-ish: WxH/keyword size + response_format */
  "openai-default",
  /** ToAPIs: ratio-as-size + resolution + image_urls */
  "toapis-default",
  /** ToAPIs GPT-Image: resolution lowercased */
  "toapis-gpt-image",
  /** ToAPIs Grok bare: size only, no response_format / resolution */
  "toapis-bare",
  /** ToAPIs /images/edits */
  "toapis-edit",
  /** APIMart: ratio-as-size + resolution + image_urls */
  "apimart-default",
  /** APIMart GPT-Image 2 style */
  "apimart-gpt-image",
  /** APIMart GPT-Image 1/1.5: no K-resolution */
  "apimart-gpt-image-1",
  /** APIMart Flux Kontext: no resolution */
  "apimart-flux-kontext",
  /** APIMart Grok Imagine (xAI): aspect_ratio, no size */
  "apimart-grok-imagine",
]);
export type ImageProtocolProfile = z.infer<typeof ImageProtocolProfileSchema>;

export const ModelProtocolSchema = z.object({
  /** openai-images dialect */
  imageProfile: ImageProtocolProfileSchema.optional(),
  /** Rewrite remoteId before send (e.g. gpt-image-1 → gpt-image-1-official) */
  modelAlias: z.string().optional(),
  /** Force /images/edits vs /images/generations when set */
  imagePath: z.enum(["generations", "edits"]).optional(),
});
export type ModelProtocol = z.infer<typeof ModelProtocolSchema>;

const APIMART_ALIASES: Record<string, string> = {
  "gpt-image-1": "gpt-image-1-official",
  "gpt-image-1.5": "gpt-image-1.5-official",
  "flux-2": "flux-2-pro",
};

/** Infer protocol when catalog does not set capabilities.protocol. */
export function inferImageProtocol(
  platform: string,
  remoteId: string,
): ModelProtocol {
  const p = platform.trim().toLowerCase();
  const model = remoteId.trim();

  if (p === "toapis") {
    if (/^(grok-imagine-1\.0-edit)$/i.test(model) || /-edit$/i.test(model)) {
      return { imageProfile: "toapis-edit", imagePath: "edits" };
    }
    if (
      /^grok-imagine-1\.0$/i.test(model) ||
      /^grok-4-\d-image$/i.test(model)
    ) {
      return { imageProfile: "toapis-bare" };
    }
    if (/^gpt-image/i.test(model)) {
      return { imageProfile: "toapis-gpt-image" };
    }
    return { imageProfile: "toapis-default" };
  }

  if (p === "apimart") {
    const alias = APIMART_ALIASES[model];
    const resolved = alias ?? model;
    if (/^grok-imagine-image/i.test(resolved)) {
      return {
        imageProfile: "apimart-grok-imagine",
        modelAlias: alias,
      };
    }
    if (/^flux-kontext/i.test(resolved)) {
      return {
        imageProfile: "apimart-flux-kontext",
        modelAlias: alias,
      };
    }
    if (/^gpt-image-1(\.5)?(-official)?$/i.test(resolved)) {
      return {
        imageProfile: "apimart-gpt-image-1",
        modelAlias: alias,
      };
    }
    if (/^gpt-image/i.test(resolved)) {
      return {
        imageProfile: "apimart-gpt-image",
        modelAlias: alias,
      };
    }
    return {
      imageProfile: "apimart-default",
      modelAlias: alias,
    };
  }

  return { imageProfile: "openai-default" };
}

/** Merge catalog protocol over inferred defaults. */
export function resolveImageProtocol(
  platform: string,
  remoteId: string,
  protocol?: ModelProtocol | null,
): ModelProtocol {
  const inferred = inferImageProtocol(platform, remoteId);
  if (!protocol) return inferred;
  return {
    imageProfile: protocol.imageProfile ?? inferred.imageProfile,
    modelAlias: protocol.modelAlias ?? inferred.modelAlias,
    imagePath: protocol.imagePath ?? inferred.imagePath,
  };
}
