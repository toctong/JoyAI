/** Static brand icon paths under `public/brand/`. Only return known downloaded assets. */

const CHANNEL_ICON: Record<string, string> = {
  volcengine: "/brand/channels/volcengine.svg",
  dashscope: "/brand/channels/dashscope.svg",
  apimart: "/brand/channels/apimart.svg",
  toapis: "/brand/channels/toapis.png",
  "openai-compatible": "/brand/models/openai.svg",
};

/** Family key → public path (files that exist under public/brand/models). */
const MODEL_FAMILY_ICON: Record<string, string> = {
  openai: "/brand/models/openai.svg",
  claude: "/brand/models/claude.svg",
  gemini: "/brand/models/gemini.svg",
  qwen: "/brand/models/qwen.svg",
  doubao: "/brand/models/doubao.svg",
  seedream: "/brand/models/seedream.svg",
  seedance: "/brand/models/seedance.svg",
  seed: "/brand/models/seed.svg",
  wan: "/brand/models/wan.svg",
  flux: "/brand/models/flux.svg",
  midjourney: "/brand/models/midjourney.svg",
  kling: "/brand/models/kling.svg",
  keling: "/brand/models/keling.svg",
  runway: "/brand/models/runway.svg",
  luma: "/brand/models/luma.svg",
  minimax: "/brand/models/minimax.svg",
  hailuo: "/brand/models/hailuo.svg",
  hunyuan: "/brand/models/hunyuan.svg",
  deepseek: "/brand/models/deepseek.svg",
  grok: "/brand/models/grok.svg",
  sora: "/brand/models/sora.svg",
  veo: "/brand/models/veo.svg",
  ideogram: "/brand/models/ideogram.svg",
  recraft: "/brand/models/recraft.svg",
  jimeng: "/brand/models/jimeng.svg",
  cogview: "/brand/models/cogview.svg",
  zhipu: "/brand/models/zhipu.svg",
  stepfun: "/brand/models/stepfun.svg",
  yi: "/brand/models/yi.svg",
  baichuan: "/brand/models/baichuan.svg",
  moonshot: "/brand/models/moonshot.svg",
  spark: "/brand/models/spark.svg",
  wenxin: "/brand/models/wenxin.svg",
  tongyi: "/brand/models/tongyi.svg",
  alibaba: "/brand/models/alibaba.svg",
  bytedance: "/brand/models/bytedance.svg",
  google: "/brand/models/google.svg",
  anthropic: "/brand/models/anthropic.svg",
  meta: "/brand/models/meta.svg",
  llama: "/brand/models/llama.svg",
  mistral: "/brand/models/mistral.svg",
  perplexity: "/brand/models/perplexity.svg",
  stability: "/brand/models/stability.svg",
  pika: "/brand/models/pika.svg",
  vidu: "/brand/models/vidu.svg",
  pixverse: "/brand/models/pixverse-color.svg",
  skyreels: "/brand/models/skyreels.svg",
  happyhorse: "/brand/models/happyhorse.svg",
  "nano-banana": "/brand/models/nano-banana.svg",
};

type FamilyRule = { re: RegExp; family: string };

/** More specific families first (seedream before seed, veo before gemini, etc.). */
const MODEL_RULES: FamilyRule[] = [
  { re: /nano[-_\s]?banana/, family: "nano-banana" },
  { re: /\bpixverse\b/, family: "pixverse" },
  { re: /\bskyreels?\b/, family: "skyreels" },
  { re: /\bhappyhorse\b/, family: "happyhorse" },
  { re: /\b(seedream)\b/, family: "seedream" },
  { re: /\b(seedance)\b/, family: "seedance" },
  { re: /\b(doubao)\b/, family: "doubao" },
  { re: /\bseed(?:ream|ance)?\b|\bseed[\d._-]/, family: "seed" },
  // wan2.7 / wanx — `\b` after wan fails on wan2.x
  { re: /\bwan(?:x|[\d._-]|\b)|tongyi/, family: "wan" },
  // qwen3.8 / qwen2.5 — same digit-boundary pattern as wan
  { re: /\bqwen(?:[\d._-]|\b)|qwq/, family: "qwen" },
  { re: /\b(gpt|o1|o3|o4|chatgpt|dall-?e|dalle)\b/, family: "openai" },
  { re: /\bsora\b/, family: "sora" },
  { re: /\b(claude|anthropic)\b/, family: "claude" },
  { re: /\bveo\b/, family: "veo" },
  { re: /\b(gemini|imagen)\b/, family: "gemini" },
  { re: /\bflux\b/, family: "flux" },
  { re: /\b(midjourney|\bmj\b)/, family: "midjourney" },
  { re: /\b(kling|keling)\b/, family: "kling" },
  { re: /\b(runway|gen-?3)\b/, family: "runway" },
  { re: /\b(luma|ray-)/, family: "luma" },
  { re: /\bhailuo\b/, family: "hailuo" },
  { re: /\b(minimax|video-01)\b/, family: "minimax" },
  { re: /\bhunyuan\b/, family: "hunyuan" },
  { re: /\bdeepseek\b/, family: "deepseek" },
  { re: /\bgrok\b/, family: "grok" },
  { re: /\bideogram\b/, family: "ideogram" },
  { re: /\brecraft\b/, family: "recraft" },
  { re: /\bjimeng\b/, family: "jimeng" },
  { re: /\b(cogview|cog|zhipu|glm)\b/, family: "zhipu" },
  { re: /\b(moonshot|kimi)\b/, family: "moonshot" },
  { re: /\bstep/, family: "stepfun" },
  { re: /\bspark\b/, family: "spark" },
  { re: /\b(ernie|wenxin)\b/, family: "wenxin" },
  { re: /\bvidu\b/, family: "vidu" },
  { re: /\bpika\b/, family: "pika" },
  { re: /\byi\b/, family: "yi" },
  { re: /\bbaichuan\b/, family: "baichuan" },
  { re: /\bmistral\b/, family: "mistral" },
  { re: /\b(llama|meta)\b/, family: "llama" },
  { re: /\bperplexity\b/, family: "perplexity" },
  { re: /\b(stability|stable.?diffusion|sdxl?)\b/, family: "stability" },
  { re: /\bbytedance\b/, family: "bytedance" },
  { re: /\balibaba\b/, family: "alibaba" },
];

function resolveFamilyIcon(family: string): string | null {
  if (family === "happyhorse") {
    return MODEL_FAMILY_ICON.happyhorse ?? MODEL_FAMILY_ICON.minimax ?? null;
  }
  if (family === "minimax" || family === "hailuo") {
    return MODEL_FAMILY_ICON.hailuo ?? MODEL_FAMILY_ICON.minimax ?? null;
  }
  if (family === "kling" || family === "keling") {
    return MODEL_FAMILY_ICON.kling ?? MODEL_FAMILY_ICON.keling ?? null;
  }
  if (family === "zhipu" || family === "cogview") {
    return MODEL_FAMILY_ICON.zhipu ?? MODEL_FAMILY_ICON.cogview ?? null;
  }
  if (family === "wan") {
    return MODEL_FAMILY_ICON.wan ?? MODEL_FAMILY_ICON.qwen ?? null;
  }
  if (family === "tongyi") {
    return MODEL_FAMILY_ICON.tongyi ?? MODEL_FAMILY_ICON.qwen ?? null;
  }
  if (family === "seedream") {
    return MODEL_FAMILY_ICON.seedream ?? MODEL_FAMILY_ICON.doubao ?? null;
  }
  if (family === "seedance") {
    return MODEL_FAMILY_ICON.seedance ?? MODEL_FAMILY_ICON.doubao ?? null;
  }
  if (family === "seed") {
    return MODEL_FAMILY_ICON.seed ?? MODEL_FAMILY_ICON.doubao ?? null;
  }
  if (family === "doubao") {
    return MODEL_FAMILY_ICON.doubao ?? null;
  }
  if (family === "veo") {
    return MODEL_FAMILY_ICON.veo ?? MODEL_FAMILY_ICON.gemini ?? null;
  }
  return MODEL_FAMILY_ICON[family] ?? null;
}

export function channelIconSrc(platform: string): string | null {
  const key = platform.trim().toLowerCase();
  return CHANNEL_ICON[key] ?? null;
}

/** Resolve model family key from remoteId / name. */
export function modelFamilyKey(input: {
  remoteId?: string;
  name?: string;
  kind?: string;
}): string | null {
  const hay = `${input.remoteId ?? ""} ${input.name ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const rule of MODEL_RULES) {
    if (rule.re.test(hay)) return rule.family;
  }
  return null;
}

export function modelIconSrc(input: {
  remoteId?: string;
  name?: string;
  kind?: string;
}): string | null {
  const family = modelFamilyKey(input);
  return family ? resolveFamilyIcon(family) : null;
}

const FAMILY_VENDOR: Record<string, string> = {
  seedream: "字节跳动",
  seedance: "字节跳动",
  seed: "字节跳动",
  doubao: "字节跳动",
  jimeng: "字节跳动",
  bytedance: "字节跳动",
  wan: "阿里云",
  qwen: "阿里云",
  tongyi: "阿里云",
  alibaba: "阿里云",
  openai: "OpenAI",
  sora: "OpenAI",
  gemini: "Google",
  veo: "Google",
  google: "Google",
  claude: "Anthropic",
  anthropic: "Anthropic",
  grok: "xAI",
  flux: "Black Forest Labs",
  kling: "快手",
  keling: "快手",
  midjourney: "Midjourney",
  runway: "Runway",
  luma: "Luma",
  minimax: "MiniMax",
  hailuo: "MiniMax",
  happyhorse: "MiniMax",
  hunyuan: "腾讯",
  deepseek: "DeepSeek",
  zhipu: "智谱",
  cogview: "智谱",
  ideogram: "Ideogram",
  recraft: "Recraft",
  vidu: "Vidu",
  pika: "Pika",
  pixverse: "PixVerse",
  skyreels: "SkyReels",
  "nano-banana": "Google",
  moonshot: "月之暗面",
  stepfun: "阶跃星辰",
  yi: "零一万物",
  baichuan: "百川",
  spark: "讯飞",
  wenxin: "百度",
  llama: "Meta",
  meta: "Meta",
  mistral: "Mistral",
  perplexity: "Perplexity",
  stability: "Stability AI",
};

/** 模型厂商展示名，如「字节跳动」「xAI」 */
export function modelVendorLabel(input: {
  remoteId?: string;
  name?: string;
  kind?: string;
}): string | null {
  const family = modelFamilyKey(input);
  if (!family) return null;
  return FAMILY_VENDOR[family] ?? null;
}
