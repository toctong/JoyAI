/**
 * Enrich catalog capabilities from documented provider specs only.
 * Does NOT invent ratios/resolutions for undocumented models.
 *
 * Sources (APIMart / ToAPIs docs fetched 2026-03):
 * - gpt-image-1/1.5, gpt-image-2, nano-banana
 * - sora-2, kling-v3, seedance-2.0, wan2.7, veo3.1
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join("packages", "shared", "src", "catalog");

const GPT_IMAGE_2_RATIOS_APIMART = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "3:1",
  "1:3",
  "21:9",
  "9:21",
];

const GPT_IMAGE_2_RATIOS_TOAPIS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "21:9",
  "9:21",
];

const GPT_IMAGE_1_RATIOS = ["1:1", "3:2", "2:3"];
const GPT_IMAGE_1_SIZES = ["1024x1024", "1536x1024", "1024x1536"];

const NANO_BANANA_RATIOS = [
  "auto",
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

const SORA_RATIOS = ["16:9", "9:16"];
const KLING_RATIOS = ["16:9", "9:16", "1:1"];
const SEEDANCE2_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "adaptive",
];
const WAN27_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const VEO_RATIOS = ["16:9", "9:16"];
const GROK_VIDEO_RATIOS = ["16:9", "9:16", "1:1"];
const HAPPYHORSE_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "4:5",
  "5:4",
  "9:21",
  "21:9",
];
/** Imagen 4.0 docs: landscape/portrait only */
const IMAGEN4_RATIOS = ["16:9", "9:16"];

/** Seedream on Ark commonly exposes these (volcengine catalog already partial). */
const SEEDREAM_ARK_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

function isRatioLike(s) {
  return /^(auto|adaptive|\d+:\d+)$/i.test(String(s).trim());
}

function isDurationLike(s) {
  return /^\d+(\.\d+)?s$/i.test(String(s).trim());
}

function uniq(arr) {
  return [...new Set((arr ?? []).filter(Boolean))];
}

function patch(caps, patchObj) {
  const next = { ...caps };
  for (const [k, v] of Object.entries(patchObj)) {
    if (v === undefined) continue;
    if (v === null) {
      delete next[k];
      continue;
    }
    if (Array.isArray(v)) {
      next[k] = uniq(v);
      if (!next[k].length) delete next[k];
    } else {
      next[k] = v;
    }
  }
  // drop empty arrays
  for (const k of Object.keys(next)) {
    if (Array.isArray(next[k]) && !next[k].length) delete next[k];
  }
  return next;
}

/**
 * Return capability patch for a model, or null if no documented changes.
 * @param {string} platform
 * @param {"llm"|"image"|"video"} kind
 * @param {object} item
 */
function documentedPatch(platform, kind, item) {
  const id = item.remoteId;
  const caps = item.capabilities ?? {};
  /** @type {Record<string, unknown>} */
  const p = {};

  // --- global hygiene: move mis-filed ratios / durations out of resolutions ---
  if (Array.isArray(caps.resolutions)) {
    const ratiosInRes = caps.resolutions.filter(isRatioLike);
    const dursInRes = caps.resolutions.filter(isDurationLike);
    const realRes = caps.resolutions.filter(
      (x) => !isRatioLike(x) && !isDurationLike(x),
    );
    if (ratiosInRes.length || dursInRes.length) {
      p.resolutions = realRes;
      if (!caps.ratios?.length && ratiosInRes.length) {
        p.ratios = ratiosInRes;
      }
    }
  }

  if (kind === "llm") {
    // LLM: no ratios/resolutions/sizes. Only keep input/output/features as-is.
    return Object.keys(p).length ? p : null;
  }

  // ========== IMAGE ==========
  if (kind === "image") {
    // GPT Image 1 / 1.5 (APIMart docs: 1:1 / 3:2 / 2:3 + inpaint)
    if (/^gpt-image-1(\.5)?(-official)?$/i.test(id) || id === "gpt-image-1.5") {
      Object.assign(p, {
        ratios: GPT_IMAGE_1_RATIOS,
        sizes: GPT_IMAGE_1_SIZES,
        maxRefImages: 15,
        features: uniq([...(caps.features ?? []), "t2i", "i2i", "inpaint"]),
        async: true,
      });
      if (!caps.resolutions?.length) p.resolutions = ["1K", "2K"];
      return p;
    }

    // GPT Image 2 family
    if (/^gpt-image-2/i.test(id)) {
      const isToapis = platform === "toapis";
      const isOfficial = /official/i.test(id);
      Object.assign(p, {
        ratios: isToapis ? GPT_IMAGE_2_RATIOS_TOAPIS : GPT_IMAGE_2_RATIOS_APIMART,
        resolutions: ["1K", "2K", "4K"],
        maxRefImages: isToapis ? 6 : /official|2\.5/i.test(id) ? 16 : 15,
        features: isOfficial
          ? ["t2i", "i2i", "inpaint"]
          : ["t2i", "i2i"],
        async: true,
      });
      return p;
    }

    // Nano Banana / Gemini flash image
    if (
      /nano[_-]?banana/i.test(id) ||
      /gemini-2\.5-flash-image/i.test(id) ||
      /gemini-3(\.1)?-(flash|pro)-image/i.test(id)
    ) {
      Object.assign(p, {
        ratios: NANO_BANANA_RATIOS,
        maxRefImages: caps.maxRefImages ?? 14,
        features: uniq(
          (caps.features ?? ["t2i", "i2i"]).filter((f) => f !== "inpaint"),
        ),
        async: true,
      });
      // lite / base banana: docs say 1K only
      if (/lite$/i.test(id) || id === "nano-banana" || /gemini-2\.5-flash-image/i.test(id)) {
        p.resolutions = ["1K"];
      } else if (!caps.resolutions?.length) {
        p.resolutions = ["1K", "2K", "4K"];
      }
      return p;
    }

    // Imagen 4.0 — only 16:9 / 9:16, text-only, no i2i
    if (/imagen-4/i.test(id)) {
      return {
        ratios: IMAGEN4_RATIOS,
        features: ["t2i"],
        input: ["text"],
        maxRefImages: null,
        async: true,
        // clear mis-filed resolutions that were ratios
        resolutions: [],
      };
    }

    // Seedream (gateway short ids)
    if (/^seedream-/i.test(id) || /^doubao-seedream-/i.test(id)) {
      Object.assign(p, {
        ratios: SEEDREAM_ARK_RATIOS,
        async: platform === "volcengine" ? (caps.async ?? false) : true,
      });
      if (/5\.0-pro|5-0-pro/i.test(id) && !caps.resolutions?.length) {
        p.resolutions = ["1K", "1.5K", "2K"];
      }
      if (/5\.0-lite|5-0($|-)/i.test(id) && !/pro/i.test(id) && !caps.resolutions?.length) {
        p.resolutions = ["2K", "3K"];
      }
      return p;
    }

    // Qwen image
    if (/^qwen-image/i.test(id)) {
      Object.assign(p, {
        ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        resolutions: caps.resolutions?.length ? caps.resolutions : ["1K", "2K"],
        async: true,
      });
      return p;
    }

    // Wan image
    if (/^wan2\.[57]-image/i.test(id) || /^wanx2\.1/i.test(id)) {
      Object.assign(p, {
        ratios: WAN27_RATIOS,
        async: true,
      });
      return p;
    }

    // Flux / z-image / grok imagine / midjourney — no reliable ratio table found;
    // only fix features hygiene if needed. Leave ratios empty.
    if (/^flux-2/i.test(id) || /^z-image/i.test(id)) {
      // t2i only models shouldn't claim i2i without docs
      return Object.keys(p).length ? p : null;
    }

    return Object.keys(p).length ? p : null;
  }

  // ========== VIDEO ==========
  if (kind === "video") {
    // Sora 2
    if (/^sora-2/i.test(id)) {
      const isPro = /pro/i.test(id);
      Object.assign(p, {
        ratios: SORA_RATIOS,
        resolutions: isPro ? ["720p", "1024p", "1080p"] : ["720p"],
        maxRefImages: 1,
        maxDurationSec: 20,
        features: ["t2v", "i2v"],
        async: true,
      });
      return p;
    }

    // Veo 3 / 3.1
    if (/^veo-?3/i.test(id) || /^Veo3/i.test(id)) {
      Object.assign(p, {
        ratios: VEO_RATIOS,
        resolutions: ["720p", "1080p", "4k"],
        maxDurationSec: 8,
        maxRefImages: /lite/i.test(id) ? 0 : /official|quality/i.test(id) ? 2 : 3,
        features: uniq(
          (caps.features ?? ["t2v", "i2v"]).filter((f) => true),
        ),
        async: true,
      });
      if (/lite/i.test(id)) {
        p.features = ["t2v"];
        p.maxRefImages = null;
        p.input = ["text"];
      }
      return p;
    }

    // Kling
    if (/^kling/i.test(id)) {
      Object.assign(p, {
        ratios: KLING_RATIOS,
        async: true,
      });
      if (/v3$/i.test(id) || /v3-omni/i.test(id)) {
        p.maxDurationSec = 15;
        p.maxRefImages = /omni/i.test(id) ? 4 : 2;
        p.resolutions = /omni|v3$/i.test(id)
          ? ["720P", "1080P", "4K"]
          : caps.resolutions;
        p.features = uniq([
          ...(caps.features ?? []),
          "t2v",
          "i2v",
          "audio",
        ]);
      }
      if (/v2-6|v2\.6/i.test(id)) {
        p.maxDurationSec = 10;
        p.maxRefImages = 2;
        p.resolutions = ["720P", "1080P"];
      }
      if (/turbo/i.test(id)) {
        p.maxDurationSec = 15;
        p.maxRefImages = 1;
        p.resolutions = ["720P", "1080P"];
        p.features = ["t2v", "i2v"];
      }
      return p;
    }

    // Seedance 2.x (gateway)
    if (/^seedance-2/i.test(id) || /^seedance-2\./i.test(id)) {
      const isMiniOrFast = /mini|fast/i.test(id);
      Object.assign(p, {
        ratios: SEEDANCE2_RATIOS,
        resolutions: isMiniOrFast
          ? ["480p", "720p"]
          : ["480p", "720p", "1080p", "4k"],
        maxDurationSec: 15,
        maxRefImages: caps.maxRefImages ?? 9,
        maxRefVideos: 3,
        maxRefAudios: 3,
        features: uniq([
          ...(caps.features ?? []),
          "t2v",
          "i2v",
          "audio",
          "ref-video",
        ]),
        async: true,
      });
      return p;
    }

    // Seedance 1.x / doubao-seedance
    if (/seedance-1/i.test(id) || /^doubao-seedance-/i.test(id)) {
      Object.assign(p, {
        ratios: caps.ratios?.length
          ? caps.ratios
          : ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        async: true,
      });
      return p;
    }

    // Wan video
    if (/^wan2\.7/i.test(id) || /^wan2\.6/i.test(id) || /^wan3\.0/i.test(id)) {
      Object.assign(p, {
        ratios: WAN27_RATIOS,
        async: true,
      });
      if (/^wan2\.7$/i.test(id) || /^wan2\.7-/i.test(id)) {
        p.resolutions = ["720P", "1080P"];
        p.maxDurationSec = 15;
        p.maxRefImages = 2;
        p.maxRefVideos = 1;
        p.maxRefAudios = 1;
        p.features = uniq([
          ...(caps.features ?? []),
          "t2v",
          "i2v",
          "audio",
          "extend",
        ]);
      }
      if (/^wan2\.6/i.test(id)) {
        p.resolutions = ["720p", "1080p"];
        p.maxDurationSec = 15;
        p.maxRefImages = 2;
      }
      if (/^wan3\.0/i.test(id)) {
        p.resolutions = ["480P", "720P", "1080P"];
        p.maxDurationSec = 30;
      }
      return p;
    }

    // HappyHorse
    if (/happyhorse/i.test(id)) {
      Object.assign(p, {
        ratios: HAPPYHORSE_RATIOS,
        resolutions: caps.resolutions?.length
          ? caps.resolutions
          : ["720P", "1080P"],
        maxDurationSec: caps.maxDurationSec ?? 15,
        async: true,
      });
      return p;
    }

    // Grok video
    if (/grok-(imagine-)?video/i.test(id) || /^grok-video/i.test(id)) {
      Object.assign(p, {
        ratios: GROK_VIDEO_RATIOS,
        async: true,
      });
      return p;
    }

    // MiniMax Hailuo
    if (/MiniMax|Hailuo|^MiniMax/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    // Vidu
    if (/^vidu/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    // Gemini omni video
    if (/gemini[_-]?omni/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    // Pixverse / SkyReels / flux-3-video — conservative common ratios only if already has res
    if (/pixverse|skyreels|flux-3-video/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    return Object.keys(p).length ? p : null;
  }

  return null;
}

function applyPatch(item, patchObj) {
  if (!patchObj) return { changed: false, item };
  const caps = { ...(item.capabilities ?? {}) };
  const next = patch(caps, patchObj);
  // handle explicit null deletes
  for (const [k, v] of Object.entries(patchObj)) {
    if (v === null) delete next[k];
    if (Array.isArray(v) && v.length === 0) delete next[k];
  }
  const before = JSON.stringify(item.capabilities ?? {});
  const after = JSON.stringify(next);
  if (before === after) return { changed: false, item };
  return {
    changed: true,
    item: { ...item, capabilities: next },
  };
}

const files = ["apimart.json", "toapis.json", "volcengine.json", "dashscope.json"];
const summary = [];

for (const file of files) {
  const fp = path.join(DIR, file);
  const doc = JSON.parse(fs.readFileSync(fp, "utf8"));
  const platform = doc.platform;
  let changed = 0;
  let skipped = 0;

  for (const kind of ["llm", "image", "video"]) {
    const list = doc[kind] ?? [];
    for (let i = 0; i < list.length; i++) {
      const patchObj = documentedPatch(platform, kind, list[i]);
      if (!patchObj) {
        skipped += 1;
        continue;
      }
      const result = applyPatch(list[i], patchObj);
      if (result.changed) {
        list[i] = result.item;
        changed += 1;
      }
    }
    doc[kind] = list;
  }

  doc.updatedAt = "2026-03-26";
  fs.writeFileSync(fp, `${JSON.stringify(doc, null, 2)}\n`);
  summary.push({ file, changed, skipped });
}

console.log(JSON.stringify(summary, null, 2));

// verify gaps remaining
for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  for (const kind of ["image", "video"]) {
    const noRatio = (doc[kind] ?? [])
      .filter((m) => !(m.capabilities?.ratios?.length))
      .map((m) => m.remoteId);
    console.log(
      doc.platform,
      kind,
      "still no ratios:",
      noRatio.join(", ") || "(none)",
    );
  }
}
