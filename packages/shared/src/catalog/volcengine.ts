import {
  type CatalogModel,
  OFFICIAL_NOTE,
  i2i,
  i2v,
  imagePrice,
  llmText,
  llmVision,
  m,
  t2i,
  t2v,
  tokenPrice,
  videoSecond,
} from "./helpers";

/** 火山方舟 — 主流 Seed / Seedream / Seedance（官方 CNY，以控制台为准） */
export const VOLCENGINE_CATALOG: CatalogModel[] = [
  // —— Image ——
  m(
    "image",
    "Seedream 5.0 Pro",
    "doubao-seedream-5-0-pro-260628",
    imagePrice(0.3, `${OFFICIAL_NOTE}；参考图首张免费、额外约 ¥0.02/张`, [
      { label: "≤236万像素 / 1K", resolution: "1K", perImage: 0.3 },
      { label: ">236万像素 / 2K", resolution: "2K", perImage: 0.6 },
    ]),
    i2i(10, {
      async: false,
      resolutions: ["1K", "1.5K", "2K"],
      features: ["t2i", "i2i", "layers", "interactive-edit"],
    }),
    {
      description: "方舟旗舰生图，支持交互编辑 / 多参考图",
      isDefault: true,
    },
  ),
  m(
    "image",
    "Seedream 5.0 Lite",
    "doubao-seedream-5-0-lite-260628",
    imagePrice(0.22, OFFICIAL_NOTE, [
      { label: "标准", resolution: "2K", perImage: 0.22 },
    ]),
    i2i(4, {
      async: false,
      resolutions: ["2K", "3K"],
      features: ["t2i", "i2i"],
    }),
    { description: "Seedream 5.0 轻量版" },
  ),
  m(
    "image",
    "Seedream 4.5",
    "doubao-seedream-4-5-251128",
    imagePrice(0.25, OFFICIAL_NOTE, [
      { label: "2K", resolution: "2K", perImage: 0.25 },
    ]),
    i2i(4, {
      async: false,
      resolutions: ["2K"],
      features: ["t2i", "i2i"],
    }),
  ),
  m(
    "image",
    "Seedream 4.0",
    "doubao-seedream-4-0-250828",
    imagePrice(0.2, OFFICIAL_NOTE, [
      { label: "2K", resolution: "2K", perImage: 0.2 },
      { label: "高清", resolution: "HD", perImage: 0.25 },
    ]),
    i2i(1, {
      async: false,
      resolutions: ["1024x1024", "2048x2048"],
      features: ["t2i", "i2i", "outpaint", "inpaint"],
    }),
  ),
  m(
    "image",
    "Seedream 3.0",
    "doubao-seedream-3-0-t2i-250415",
    imagePrice(0.15, OFFICIAL_NOTE),
    t2i({ async: false, resolutions: ["1024x1024", "2048x2048"] }),
  ),

  // —— Video（Seedance 2.x 官方按视频 token；附参考秒价便于对照） ——
  m(
    "video",
    "Seedance 2.5",
    "doubao-seedance-2-5-260628",
    tokenPrice(
      70,
      70,
      `${OFFICIAL_NOTE}；按视频 token。无视频输入约 ¥70/M，含视频输入约 ¥42/M`,
    ),
    i2v(9, {
      maxDurationSec: 15,
      resolutions: ["480p", "720p", "1080p", "4k"],
      ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
      maxRefVideos: 1,
      maxRefAudios: 1,
      features: ["t2v", "i2v", "r2v", "audio", "reference-video"],
    }),
    {
      description: "最新 Seedance；官方按 token，控制台可看秒级估算",
      isDefault: true,
    },
  ),
  m(
    "video",
    "Seedance 2.0",
    "doubao-seedance-2-0-260128",
    tokenPrice(
      46,
      46,
      `${OFFICIAL_NOTE}；720p 无视频输入 ¥46/M、含输入 ¥28/M；1080p 约 ¥51/¥31`,
    ),
    i2v(9, {
      maxDurationSec: 15,
      resolutions: ["480p", "720p", "1080p", "4k"],
      ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
      maxRefVideos: 1,
      maxRefAudios: 1,
      features: ["t2v", "i2v", "r2v", "audio", "reference-video"],
    }),
    { description: "Seedance 2.0 标准（最高 4K）" },
  ),
  m(
    "video",
    "Seedance 2.0 Fast",
    "doubao-seedance-2-0-fast-260128",
    tokenPrice(
      37,
      37,
      `${OFFICIAL_NOTE}；无视频输入约 ¥37/M，含视频输入约 ¥22/M`,
    ),
    i2v(4, {
      maxDurationSec: 15,
      resolutions: ["480p", "720p"],
      maxRefVideos: 0,
      maxRefAudios: 1,
      features: ["t2v", "i2v", "audio"],
    }),
    { description: "Seedance 2.0 快速档" },
  ),
  m(
    "video",
    "Seedance 2.0 Mini",
    "doubao-seedance-2-0-mini-260615",
    tokenPrice(
      23,
      23,
      `${OFFICIAL_NOTE}；无视频输入 ¥23/M、含输入 ¥14/M；刊例亦可按约 ¥0.5/秒（720p）`,
    ),
    i2v(4, {
      maxDurationSec: 12,
      resolutions: ["480p", "720p"],
      maxRefVideos: 0,
      maxRefAudios: 0,
      features: ["t2v", "i2v"],
    }),
  ),
  m(
    "video",
    "Seedance 1.5 Pro",
    "doubao-seedance-1-5-pro-251015",
    videoSecond(0.75, OFFICIAL_NOTE, [
      { label: "720p", resolution: "720p", perSecond: 0.75 },
      { label: "1080p", resolution: "1080p", perSecond: 1.1 },
    ]),
    i2v(1, {
      maxDurationSec: 15,
      resolutions: ["720p", "1080p"],
      features: ["t2v", "i2v", "audio"],
    }),
  ),
  m(
    "video",
    "Seedance 1.0 Pro",
    "doubao-seedance-1-0-pro-250528",
    videoSecond(0.6, OFFICIAL_NOTE, [
      { label: "480p", resolution: "480p", perSecond: 0.4 },
      { label: "720p", resolution: "720p", perSecond: 0.6 },
      { label: "1080p", resolution: "1080p", perSecond: 0.9 },
    ]),
    i2v(1, {
      maxDurationSec: 12,
      resolutions: ["480p", "720p", "1080p"],
      ratios: ["16:9", "9:16", "1:1"],
    }),
  ),
  m(
    "video",
    "Seedance 1.0 Lite",
    "doubao-seedance-1-0-lite-t2v-250428",
    videoSecond(0.35, OFFICIAL_NOTE, [
      { label: "480p", resolution: "480p", perSecond: 0.25 },
      { label: "720p", resolution: "720p", perSecond: 0.35 },
    ]),
    t2v({
      maxDurationSec: 10,
      resolutions: ["480p", "720p"],
      ratios: ["16:9", "9:16", "1:1"],
    }),
  ),

  // —— LLM ——
  m(
    "llm",
    "Doubao Seed Evolving",
    "doubao-seed-evolving",
    tokenPrice(6, 30, OFFICIAL_NOTE),
    llmVision(["reasoning", "long-context"]),
    { description: "豆包最新演进旗舰（目录）" },
  ),
  m(
    "llm",
    "Doubao Seed 2.1 Pro",
    "doubao-seed-2-1-pro-260628",
    tokenPrice(6, 30, OFFICIAL_NOTE),
    llmVision(["reasoning", "long-context"]),
    { description: "Seed 2.1 Pro，缓存命中约 ¥1.2/M 输入" },
  ),
  m(
    "llm",
    "Doubao Seed 2.1 Turbo",
    "doubao-seed-2-1-turbo-260628",
    tokenPrice(3, 15, OFFICIAL_NOTE),
    llmVision(["reasoning"]),
    { description: "Seed 2.1 Turbo，缓存命中约 ¥0.6/M 输入" },
  ),
  m(
    "llm",
    "Doubao Seed 2.0 Lite",
    "doubao-seed-2-0-lite",
    tokenPrice(1.2, 4.8, OFFICIAL_NOTE),
    llmVision(),
  ),
  m(
    "llm",
    "Doubao Seed 2.0 Mini",
    "doubao-seed-2-0-mini",
    tokenPrice(0.6, 2.4, OFFICIAL_NOTE),
    llmText(),
  ),
  m(
    "llm",
    "Doubao Seed 1.6",
    "doubao-seed-1-6-250615",
    tokenPrice(0.8, 2.0, OFFICIAL_NOTE),
    llmVision(["reasoning"]),
  ),
  m(
    "llm",
    "Doubao 1.5 Pro",
    "doubao-1-5-pro-32k-250115",
    tokenPrice(0.8, 2.0, OFFICIAL_NOTE),
    llmText(),
  ),
  m(
    "llm",
    "Doubao 1.5 Vision Pro",
    "doubao-1-5-vision-pro-32k-250115",
    tokenPrice(3.0, 9.0, OFFICIAL_NOTE),
    llmVision(),
  ),
  m(
    "llm",
    "DeepSeek V4 Pro (方舟)",
    "deepseek-v4-pro",
    tokenPrice(12, 24, OFFICIAL_NOTE),
    llmText(["reasoning"]),
    { description: "方舟托管 DeepSeek V4 Pro（目录）" },
  ),
  m(
    "llm",
    "DeepSeek V4 Flash (方舟)",
    "deepseek-v4-flash",
    tokenPrice(1, 2, OFFICIAL_NOTE),
    llmText(),
  ),
  m(
    "llm",
    "GLM-5.2 (方舟)",
    "glm-5.2",
    tokenPrice(4, 18, OFFICIAL_NOTE),
    llmText(["reasoning"]),
  ),
];
