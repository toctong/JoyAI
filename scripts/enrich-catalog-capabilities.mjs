/**
 * Enrich catalog capabilities from documented provider specs only.
 * Does NOT invent ratios/resolutions/sizes for undocumented models (Flux/Grok/MJ).
 *
 * Documented sources (fetched 2026-03 / 2026-09):
 * - ToAPIs Seedance 2/mini/fast: https://docs.toapis.com/docs/en/api-reference/videos/seedance-2/generation
 * - APIMart Seedance 2.0: https://docs.apimart.ai/en/api-reference/videos/seedance-2.0/generation
 * - APIMart Kling 3.0 Turbo: https://docs.apimart.ai/en/api-reference/videos/kling-3.0-turbo/generation
 * - APIMart Seedream 5.0 Pro / Nano Banana / GPT Image
 * - DashScope Wan 2.7 i2v: https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference
 * - DashScope Qwen Image: https://help.aliyun.com/en/model-studio/qwen-image-api
 * - Volcengine / Ark Seedance & Seedream (Ark-shaped mirrors + vendor doc IDs)
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join("packages", "shared", "src", "catalog");
const UPDATED_AT = "2026-09-16";

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
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "adaptive",
];
const WAN_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
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
const IMAGEN4_RATIOS = ["16:9", "9:16"];

/** Seedream Ark / aggregator common ratios (+ auto on gateways). */
const SEEDREAM_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
  "21:9",
];
const SEEDREAM_RATIOS_GATEWAY = ["auto", ...SEEDREAM_RATIOS];

/** DashScope Qwen Image plus / max / image — fixed WxH list (docs use `*`, catalog uses `x`). */
const QWEN_FIXED_SIZES = [
  "1664x928",
  "1472x1104",
  "1328x1328",
  "1104x1472",
  "928x1664",
];
const QWEN_FIXED_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"];
const QWEN_FLEX_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

const SEEDANCE2_FEATURES = [
  "t2v",
  "i2v",
  "r2v",
  "omni-ref",
  "first-last-frame",
  "audio",
  "ref-video",
];

/** Seedance 2.x multimodal ref media limits (Ark / gateway docs). */
const REF_MEDIA_SEEDANCE2 = {
  input: ["text", "image", "video", "audio"],
  minRefVideoDurationSec: 2,
  maxRefVideoDurationSec: 15,
  maxRefAudioDurationSec: 15,
  minRefImageSidePx: 300,
  maxRefImageSidePx: 6000,
  minRefImageAspect: 0.4,
  maxRefImageAspect: 2.5,
  maxRefImageBytes: 31457280,
  maxRefVideoBytes: 52428800,
  maxRefAudioBytes: 15728640,
};

/** Seedream i2i reference image limits (Ark docs). */
const REF_IMAGE_SEEDREAM = {
  minRefImageSidePx: 15,
  maxRefImagePixels: 36000000,
  minRefImageAspect: 0.0625,
  maxRefImageAspect: 16,
  maxRefImageBytes: 10485760,
};

/** Seedance 1.x / first-last style image refs (same pixel envelope as 2.x images). */
const REF_IMAGE_SEEDANCE1 = {
  minRefImageSidePx: 300,
  maxRefImageSidePx: 6000,
  minRefImageAspect: 0.4,
  maxRefImageAspect: 2.5,
  maxRefImageBytes: 31457280,
};

/** DashScope Wan i2v / r2v — official 百炼 image/audio limits. */
const REF_MEDIA_WAN = {
  minRefImageSidePx: 240,
  maxRefImageSidePx: 8000,
  minRefImageAspect: 0.125, // 1:8
  maxRefImageAspect: 8, // 8:1
  maxRefImageBytes: 20971520, // 20MB
  minRefVideoDurationSec: 2,
  maxRefVideoDurationSec: 15,
  maxRefVideoBytes: 52428800,
  minRefAudioDurationSec: 2,
  maxRefAudioDurationSec: 30,
  maxRefAudioBytes: 15728640, // 15MB
};

function isRatioLike(s) {
  return /^(auto|adaptive|\d+:\d+)$/i.test(String(s).trim());
}

function isDurationLike(s) {
  return /^\d+(\.\d+)?s$/i.test(String(s).trim());
}

/** WxH like 1024x1024 or 1024*1024 */
function isPixelSize(s) {
  return /^\d+\s*[x*×]\s*\d+$/i.test(String(s).trim());
}

function normalizePixelSize(s) {
  const m = String(s)
    .trim()
    .match(/^(\d+)\s*[x*×]\s*(\d+)$/i);
  if (!m) return String(s).trim();
  return `${m[1]}x${m[2]}`;
}

function uniq(arr) {
  return [...new Set((arr ?? []).filter((x) => x != null && x !== ""))];
}

function withoutFeatures(features, drop) {
  const dropSet = new Set(drop);
  return (features ?? []).filter((f) => !dropSet.has(f));
}

function setFeatures(features, add, drop = []) {
  return uniq([...withoutFeatures(features, drop), ...add]);
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
  for (const k of Object.keys(next)) {
    if (Array.isArray(next[k]) && !next[k].length) delete next[k];
  }
  return next;
}

function hygieneFromResolutions(caps, p) {
  if (!Array.isArray(caps.resolutions)) return;
  const ratiosInRes = caps.resolutions.filter(isRatioLike);
  const dursInRes = caps.resolutions.filter(isDurationLike);
  const pixelsInRes = caps.resolutions.filter(isPixelSize);
  const realRes = caps.resolutions.filter(
    (x) => !isRatioLike(x) && !isDurationLike(x) && !isPixelSize(x),
  );
  if (ratiosInRes.length || dursInRes.length || pixelsInRes.length) {
    p.resolutions = realRes;
    if (!caps.ratios?.length && ratiosInRes.length) {
      p.ratios = ratiosInRes;
    }
    if (pixelsInRes.length) {
      p.sizes = uniq([
        ...(caps.sizes ?? []),
        ...(p.sizes ?? []),
        ...pixelsInRes.map(normalizePixelSize),
      ]);
    }
  }
}

function isSeedance2(id) {
  return (
    /^seedance-2([.-]|$)/i.test(id) ||
    /^seedance-2\./i.test(id) ||
    /^doubao-seedance-2/i.test(id)
  );
}

function isSeedance2MiniOrFast(id) {
  return /mini|fast/i.test(id);
}

function isSeedance25(id) {
  return /seedance-2[.-]?5|seedance-2_5|2-5-260628/i.test(id);
}

/**
 * @param {string} platform
 * @param {"llm"|"image"|"video"} kind
 * @param {object} item
 */
function documentedPatch(platform, kind, item) {
  const id = item.remoteId;
  const caps = item.capabilities ?? {};
  /** @type {Record<string, unknown>} */
  const p = {};

  hygieneFromResolutions(caps, p);

  if (kind === "llm") {
    return Object.keys(p).length ? p : null;
  }

  // ========== IMAGE ==========
  if (kind === "image") {
    if (
      /^gpt-image-1(\.5)?(-official)?$/i.test(id) ||
      id === "gpt-image-1.5"
    ) {
      Object.assign(p, {
        ratios: GPT_IMAGE_1_RATIOS,
        sizes: GPT_IMAGE_1_SIZES,
        maxRefImages: 15,
        features: setFeatures(caps.features, ["t2i", "i2i", "inpaint"]),
        async: true,
      });
      return p;
    }

    if (/^gpt-image-2/i.test(id)) {
      const isToapis = platform === "toapis";
      const isOfficial = /official/i.test(id);
      Object.assign(p, {
        ratios: isToapis
          ? GPT_IMAGE_2_RATIOS_TOAPIS
          : GPT_IMAGE_2_RATIOS_APIMART,
        resolutions: ["1K", "2K", "4K"],
        maxRefImages: isToapis ? 6 : /official|2\.5/i.test(id) ? 16 : 15,
        features: isOfficial ? ["t2i", "i2i", "inpaint"] : ["t2i", "i2i"],
        async: true,
      });
      return p;
    }

    if (
      /nano[_-]?banana/i.test(id) ||
      /gemini-2\.5-flash-image/i.test(id) ||
      /gemini-3(\.1)?-(flash|pro)-image/i.test(id)
    ) {
      const isLiteOrBase =
        /lite$/i.test(id) ||
        id === "nano-banana" ||
        /gemini-2\.5-flash-image/i.test(id);
      Object.assign(p, {
        ratios: NANO_BANANA_RATIOS,
        maxRefImages: 14,
        resolutions: isLiteOrBase ? ["1K"] : ["1K", "2K", "4K"],
        features: setFeatures(
          caps.features ?? ["t2i", "i2i"],
          ["t2i", "i2i"],
          ["inpaint"],
        ),
        async: true,
      });
      return p;
    }

    if (/imagen-4/i.test(id)) {
      return {
        ratios: IMAGEN4_RATIOS,
        features: ["t2i"],
        input: ["text"],
        maxRefImages: null,
        async: true,
        resolutions: [],
      };
    }

    if (/^seedream-/i.test(id) || /^doubao-seedream-/i.test(id)) {
      const gateway = platform !== "volcengine";
      Object.assign(p, {
        ratios: gateway ? SEEDREAM_RATIOS_GATEWAY : SEEDREAM_RATIOS,
        async: gateway ? true : (caps.async ?? false),
        features: setFeatures(caps.features, ["t2i", "i2i"]),
        ...REF_IMAGE_SEEDREAM,
      });
      if (/5[.-]?0-pro|5-0-pro/i.test(id)) {
        p.resolutions = ["1K", "1.5K", "2K"];
        p.maxRefImages = 10;
      } else if (
        /5[.-]?0-lite|5-0-lite|seedream-5\.0-lite|doubao-seedream-5-0-lite/i.test(
          id,
        ) ||
        (/5[.-]?0/i.test(id) && !/pro/i.test(id))
      ) {
        p.resolutions = ["2K", "3K"];
        p.maxRefImages = platform === "volcengine" ? 14 : 10;
      } else if (/4[.-]?5/i.test(id)) {
        p.resolutions = ["2K", "4K"];
        p.maxRefImages = platform === "volcengine" ? 14 : 10;
      } else if (/4[.-]?0/i.test(id)) {
        p.resolutions = ["1K", "2K", "4K"];
        p.maxRefImages = platform === "volcengine" ? 14 : 10;
      } else if (!caps.resolutions?.length && !p.resolutions) {
        p.resolutions = ["2K"];
        p.maxRefImages = 10;
      }
      return p;
    }

    // Qwen Image — plus/max/legacy fixed WxH; 2.0/3.0 flex ratio+K
    if (/^qwen-image/i.test(id)) {
      const isFixedList =
        /^qwen-image(-plus|-max)?$/i.test(id) ||
        id === "qwen-image-plus" ||
        id === "qwen-image-max";
      if (isFixedList) {
        Object.assign(p, {
          sizes: QWEN_FIXED_SIZES,
          ratios: QWEN_FIXED_RATIOS,
          resolutions: [],
          maxRefImages: caps.maxRefImages ?? 3,
          features: setFeatures(caps.features, ["t2i", "i2i"]),
          async: true,
        });
      } else {
        Object.assign(p, {
          ratios: QWEN_FLEX_RATIOS,
          resolutions: ["1K", "2K"],
          maxRefImages: caps.maxRefImages ?? 3,
          features: setFeatures(caps.features, ["t2i", "i2i"]),
          async: true,
        });
      }
      return p;
    }

    // Wan image + wanx — move WxH out of resolutions via hygiene; set ratios
    if (/^wan2\.[57]-image/i.test(id) || /^wanx2\.1/i.test(id)) {
      Object.assign(p, {
        ratios: WAN_VIDEO_RATIOS,
        async: true,
        features: setFeatures(caps.features, ["t2i", "i2i"]),
        ...REF_MEDIA_WAN,
        maxRefVideoDurationSec: null,
        maxRefVideoBytes: null,
        minRefAudioDurationSec: null,
        maxRefAudioDurationSec: null,
        maxRefAudioBytes: null,
        minRefVideoDurationSec: null,
      });
      // wanx2.1-t2i-plus: after hygiene, ensure sizes if pixels were in res
      if (/wanx2\.1-t2i-plus/i.test(id)) {
        const fromRes = (caps.resolutions ?? [])
          .filter(isPixelSize)
          .map(normalizePixelSize);
        if (fromRes.length || p.sizes) {
          p.sizes = uniq([...(caps.sizes ?? []), ...(p.sizes ?? []), ...fromRes]);
          p.resolutions = [];
        }
      }
      return p;
    }

    // Flux / grok / midjourney — leave empty (no doc tables)
    return Object.keys(p).length ? p : null;
  }

  // ========== VIDEO ==========
  if (kind === "video") {
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

    if (/^veo-?3/i.test(id) || /^Veo3/i.test(id)) {
      Object.assign(p, {
        ratios: VEO_RATIOS,
        resolutions: ["720p", "1080p", "4k"],
        maxDurationSec: 8,
        async: true,
      });
      if (/lite/i.test(id)) {
        p.features = ["t2v"];
        p.maxRefImages = null;
        p.input = ["text"];
      } else {
        p.maxRefImages = /official|quality/i.test(id) ? 2 : 3;
        p.features = setFeatures(caps.features, ["t2v", "i2v"]);
      }
      return p;
    }

    if (/^kling/i.test(id)) {
      Object.assign(p, {
        ratios: KLING_RATIOS,
        async: true,
      });
      if (/turbo/i.test(id)) {
        // APIMart: first-frame only — no first-last-frame
        Object.assign(p, {
          maxDurationSec: 15,
          maxRefImages: 1,
          resolutions: ["720P", "1080P"],
          features: setFeatures(
            caps.features,
            ["t2v", "i2v"],
            ["first-last-frame", "omni-ref", "r2v"],
          ),
        });
        return p;
      }
      if (/v3-omni/i.test(id)) {
        Object.assign(p, {
          maxDurationSec: 15,
          maxRefImages: 4,
          resolutions: ["720P", "1080P", "4K"],
          features: setFeatures(caps.features, [
            "t2v",
            "i2v",
            "audio",
            "omni-ref",
          ]),
        });
        return p;
      }
      if (/v3$/i.test(id) || /kling-v3$/i.test(id)) {
        Object.assign(p, {
          maxDurationSec: 15,
          maxRefImages: 2,
          resolutions: ["720P", "1080P", "4K"],
          features: setFeatures(caps.features, [
            "t2v",
            "i2v",
            "audio",
            "first-last-frame",
          ]),
        });
        return p;
      }
      if (/v2-6|v2\.6/i.test(id)) {
        Object.assign(p, {
          maxDurationSec: 10,
          maxRefImages: 2,
          resolutions: ["720P", "1080P"],
          features: setFeatures(caps.features, ["t2v", "i2v"]),
        });
        return p;
      }
      return p;
    }

    // Seedance 2.x (gateway short ids + volcengine doubao-seedance-2*)
    if (isSeedance2(id)) {
      const miniOrFast = isSeedance2MiniOrFast(id);
      const is25 = isSeedance25(id);
      Object.assign(p, {
        ...REF_MEDIA_SEEDANCE2,
        ratios: SEEDANCE2_RATIOS,
        resolutions: miniOrFast
          ? ["480p", "720p"]
          : is25
            ? ["480p", "720p", "1080p"]
            : ["480p", "720p", "1080p", "4k"],
        maxDurationSec: is25 ? 30 : 15,
        maxRefImages: 9,
        maxRefVideos: 3,
        maxRefAudios: 3,
        features: SEEDANCE2_FEATURES,
        async: true,
      });
      return p;
    }

    // Seedance 1.x
    if (/seedance-1/i.test(id) || /^doubao-seedance-1/i.test(id)) {
      Object.assign(p, {
        ...REF_IMAGE_SEEDANCE1,
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        async: true,
        features: setFeatures(caps.features, ["t2v", "i2v", "first-last-frame"]),
      });
      return p;
    }

    // Wan video — 2.6 has NO first-last; 2.7 i2v/videoedit DOES
    if (/^wan2\.7/i.test(id) || /^wan2\.6/i.test(id) || /^wan3\.0/i.test(id)) {
      Object.assign(p, {
        ratios: WAN_VIDEO_RATIOS,
        async: true,
        ...REF_MEDIA_WAN,
      });
      if (/^wan2\.7/i.test(id)) {
        p.resolutions = ["720P", "1080P"];
        p.maxDurationSec = 15;
        p.maxRefImages = /t2v/i.test(id) ? 0 : 2;
        if (/t2v/i.test(id)) p.maxRefImages = null;
        else p.maxRefImages = 2;
        p.maxRefVideos = 1;
        p.maxRefAudios = 1;
        const base = ["t2v", "i2v", "audio", "extend"];
        if (/i2v|videoedit/i.test(id)) {
          p.features = setFeatures(caps.features, [
            ...base,
            "first-last-frame",
          ]);
        } else if (/r2v/i.test(id)) {
          p.features = setFeatures(
            caps.features,
            [...base, "r2v", "omni-ref"],
            ["first-last-frame"],
          );
        } else {
          p.features = setFeatures(caps.features, base, [
            "first-last-frame",
          ]);
        }
      } else if (/^wan2\.6/i.test(id)) {
        p.resolutions = ["720P", "1080P"];
        p.maxDurationSec = 15;
        p.maxRefImages = /t2v/i.test(id) ? null : 1;
        p.maxRefVideos = null;
        p.maxRefAudios = null;
        p.maxRefVideoDurationSec = null;
        p.maxRefVideoBytes = null;
        p.maxRefAudioBytes = null;
        p.features = setFeatures(
          caps.features,
          /t2v/i.test(id) ? ["t2v"] : ["t2v", "i2v"],
          ["first-last-frame", "omni-ref", "r2v"],
        );
      } else if (/^wan3\.0/i.test(id)) {
        p.resolutions = ["480P", "720P", "1080P"];
        p.maxDurationSec = 30;
        p.features = setFeatures(caps.features, ["t2v", "i2v"]);
      }
      return p;
    }

    if (/happyhorse/i.test(id)) {
      Object.assign(p, {
        ratios: HAPPYHORSE_RATIOS,
        resolutions: caps.resolutions?.length
          ? caps.resolutions.filter(
              (x) => !isRatioLike(x) && !isPixelSize(x),
            )
          : ["720P", "1080P"],
        maxDurationSec: caps.maxDurationSec ?? 15,
        async: true,
      });
      return p;
    }

    if (/grok-(imagine-)?video/i.test(id) || /^grok-video/i.test(id)) {
      Object.assign(p, {
        ratios: GROK_VIDEO_RATIOS,
        async: true,
      });
      return p;
    }

    if (/MiniMax|Hailuo|^MiniMax/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    if (/^vidu/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

    if (/gemini[_-]?omni/i.test(id)) {
      Object.assign(p, {
        ratios: ["16:9", "9:16", "1:1"],
        async: true,
      });
      return p;
    }

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

const files = [
  "apimart.json",
  "toapis.json",
  "volcengine.json",
  "dashscope.json",
];
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

  doc.updatedAt = UPDATED_AT;
  fs.writeFileSync(fp, `${JSON.stringify(doc, null, 2)}\n`);
  summary.push({ file, changed, skipped });
}

console.log(JSON.stringify(summary, null, 2));

// Acceptance spot-checks
function findModel(doc, kind, remoteId) {
  return (doc[kind] ?? []).find((m) => m.remoteId === remoteId);
}

function assert(cond, msg) {
  if (!cond) console.error("FAIL:", msg);
  else console.log("OK:", msg);
}

{
  const toapis = JSON.parse(
    fs.readFileSync(path.join(DIR, "toapis.json"), "utf8"),
  );
  const s2 = findModel(toapis, "video", "seedance-2");
  const s2m = findModel(toapis, "video", "seedance-2-mini");
  assert(s2?.capabilities?.maxRefImages === 9, "toapis seedance-2 maxRefImages=9");
  assert(
    s2?.capabilities?.minRefImageSidePx === 300 &&
      s2?.capabilities?.maxRefImageBytes === 31457280 &&
      s2?.capabilities?.maxRefVideoDurationSec === 15,
    "toapis seedance-2 ref size/duration",
  );
  assert(
    s2?.capabilities?.features?.includes("omni-ref") &&
      s2?.capabilities?.features?.includes("first-last-frame"),
    "toapis seedance-2 omni+first-last",
  );
  assert(
    s2m?.capabilities?.resolutions?.every((r) =>
      ["480p", "720p"].includes(r),
    ) && !s2m?.capabilities?.resolutions?.includes("1080p"),
    "toapis seedance-2-mini no 1080p",
  );

  const dash = JSON.parse(
    fs.readFileSync(path.join(DIR, "dashscope.json"), "utf8"),
  );
  const w26 = findModel(dash, "video", "wan2.6-i2v-flash");
  const w27 = findModel(dash, "video", "wan2.7-i2v");
  const qplus = findModel(dash, "image", "qwen-image-plus");
  assert(
    !w26?.capabilities?.features?.includes("first-last-frame"),
    "dashscope wan2.6-i2v-flash NO first-last",
  );
  assert(
    w27?.capabilities?.features?.includes("first-last-frame"),
    "dashscope wan2.7-i2v HAS first-last",
  );
  assert(
    qplus?.capabilities?.sizes?.includes("1664x928"),
    "dashscope qwen-image-plus has sizes",
  );

  const apimart = JSON.parse(
    fs.readFileSync(path.join(DIR, "apimart.json"), "utf8"),
  );
  const turbo = findModel(apimart, "video", "kling-3.0-turbo");
  const kv3 = findModel(apimart, "video", "kling-v3");
  const flux = findModel(apimart, "image", "flux-2-pro");
  assert(
    !turbo?.capabilities?.features?.includes("first-last-frame"),
    "apimart kling-3.0-turbo NO first-last",
  );
  assert(
    kv3?.capabilities?.features?.includes("first-last-frame"),
    "apimart kling-v3 HAS first-last",
  );
  assert(
    Boolean(flux?.capabilities?.ratios?.length),
    "apimart flux-2-pro has ratios",
  );

  const volc = JSON.parse(
    fs.readFileSync(path.join(DIR, "volcengine.json"), "utf8"),
  );
  const mini = findModel(volc, "video", "doubao-seedance-2-0-mini-260615");
  assert(
    mini?.capabilities?.maxRefImages === 9 &&
      mini?.capabilities?.maxRefVideos === 3,
    "volcengine seedance mini refs 9/3",
  );
  assert(
    mini?.capabilities?.minRefImageSidePx === 300 &&
      mini?.capabilities?.maxRefAudioBytes === 15728640,
    "volcengine seedance mini ref media limits",
  );

  const apimartSeedream = findModel(apimart, "image", "seedream-5.0-pro");
  assert(
    apimartSeedream?.capabilities?.maxRefImagePixels === 36000000 &&
      apimartSeedream?.capabilities?.minRefImageSidePx === 15,
    "apimart seedream-5.0-pro ref image size",
  );

  const wanR2v = findModel(
    JSON.parse(fs.readFileSync(path.join(DIR, "dashscope.json"), "utf8")),
    "video",
    "wan2.7-r2v",
  );
  assert(
    wanR2v?.capabilities?.minRefImageSidePx === 240 &&
      wanR2v?.capabilities?.maxRefImageSidePx === 8000 &&
      wanR2v?.capabilities?.maxRefImageBytes === 20971520 &&
      wanR2v?.capabilities?.maxRefAudioDurationSec === 30 &&
      wanR2v?.capabilities?.maxRefVideos === 1,
    "dashscope wan2.7-r2v ref limits",
  );
}

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
