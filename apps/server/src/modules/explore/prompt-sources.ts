/** Built-in remote prompt libraries for explore「提示词库」. */

export type PromptSourceKind =
  | "yukkcat"
  | "xianyu-json"
  | "tigerowo-cases"
  | "davidwu-json"
  | "xianyu-gallery"
  /** YouMind README gallery (image and/or video via optional video-urls.json) */
  | "youmind-readme"
  /** @deprecated alias of youmind-readme */
  | "youmind-seedance"
  | "ericgood-video"
  | "domer-explore"
  /** Civitai model market (PixAI-like cards) */
  | "civitai-models"
  /** PixAI model market */
  | "pixai-market";

export type PromptSourceMedia = "image" | "video" | "mixed";

export type PromptSourceDef = {
  id: string;
  /** Short chip label for explore UI */
  label: string;
  homepage: string;
  kind: PromptSourceKind;
  media: PromptSourceMedia;
  /** Primary fetch URL (JSON) or raw repo base (tigerowo) */
  url: string;
  /** Optional model id stamped on feed items (YouMind / filtered Domer) */
  modelId?: string;
  /** Optional tag stamped on YouMind items */
  tag?: string;
  /** Domer: case-insensitive substring match on task.model */
  modelFilter?: string;
  /** Civitai models sort */
  civitaiSort?:
    | "Highest Rated"
    | "Most Downloaded"
    | "Newest"
    | "Most Liked"
    | "Most Discussed";
  /** Civitai model types, e.g. "LORA" or "Checkpoint" */
  civitaiTypes?: string;
  /** PixAI market sort hint */
  pixaiSort?: "hot" | "popular" | "newest";
};

/** jsDelivr is more reliable than raw.githubusercontent.com from CN networks. */
const YUKKCAT_BASE =
  "https://cdn.jsdelivr.net/gh/yukkcat/image-prompts@main/dist/sources";

export const PROMPT_SOURCES: PromptSourceDef[] = [
  {
    id: "gpt-image-2-prompts",
    label: "GPT Image 2",
    // tigerowo 需解析多份大 MD，国内冷启动常 30s+；改用同题材的预聚合 JSON
    homepage: "https://github.com/freestylefly/awesome-gpt-image-2",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/freestylefly-gpt-image-2.json`,
  },
  {
    id: "awesome-gpt-image",
    label: "Awesome GPT Image",
    homepage: "https://github.com/ZeroLu/awesome-gpt-image",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/awesome-gpt-image.json`,
  },
  {
    id: "awesome-gpt4o-image-prompts",
    label: "GPT-4o Prompts",
    homepage: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/awesome-gpt4o-image-prompts.json`,
  },
  {
    id: "xianyu-awesome-gptimage2",
    label: "咸鱼 GPT Image 2",
    homepage: "https://github.com/xianyu110/awesome-gptimage2",
    kind: "xianyu-json",
    media: "image",
    url: "https://cdn.jsdelivr.net/gh/xianyu110/awesome-gptimage2@main/data/latest-prompts.json",
  },
  {
    id: "youmind-gpt-image-2",
    label: "YouMind GPT Image 2",
    homepage: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/youmind-gpt-image-2.json`,
  },
  {
    id: "youmind-nano-banana-pro",
    label: "Nano Banana Pro",
    homepage: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/youmind-nano-banana-pro.json`,
  },
  {
    id: "davidwu-gpt-image2-prompts",
    label: "DavidWu Prompts",
    homepage: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/davidwu-gpt-image2-prompts.json`,
  },
  {
    id: "banana-prompt-quicker",
    label: "Banana Quicker",
    homepage: "https://glidea.github.io/banana-prompt-quicker/",
    kind: "yukkcat",
    media: "image",
    url: `${YUKKCAT_BASE}/banana-prompt-quicker.json`,
  },
  {
    id: "xianyu-multi-model",
    label: "image-prompt-generator",
    homepage: "https://github.com/xianyu110/image-prompt-generator",
    kind: "xianyu-gallery",
    media: "image",
    url: "https://cdn.jsdelivr.net/gh/xianyu110/image-prompt-generator@main/data/prompts.json",
  },
  {
    id: "youmind-seedance-2",
    label: "YouMind Seedance",
    homepage: "https://youmind.com/zh-CN/seedance-2-0-prompts",
    kind: "youmind-readme",
    media: "video",
    modelId: "seedance-2.0",
    tag: "seedance",
    // README 含最多约 100 条精选提示词；同仓 video-urls.json 映射可播放 release mp4
    url: "https://cdn.jsdelivr.net/gh/YouMind-OpenLab/awesome-seedance-2-prompts@main/README_zh.md",
  },
  {
    id: "youmind-seedream-4.5",
    label: "YouMind Seedream",
    homepage: "https://github.com/YouMind-OpenLab/awesome-seedream-4.5",
    kind: "youmind-readme",
    media: "image",
    modelId: "seedream-4.5",
    tag: "seedream",
    url: "https://cdn.jsdelivr.net/gh/YouMind-OpenLab/awesome-seedream-4.5@main/README_zh.md",
  },
  {
    id: "youmind-grok-imagine",
    label: "YouMind Grok Imagine",
    homepage: "https://github.com/YouMind-OpenLab/awesome-grok-imagine-prompts",
    kind: "youmind-readme",
    media: "video",
    modelId: "grok-imagine",
    tag: "grok",
    url: "https://cdn.jsdelivr.net/gh/YouMind-OpenLab/awesome-grok-imagine-prompts@main/README_zh.md",
  },
  {
    id: "youmind-gemini-3",
    label: "YouMind Gemini 3",
    homepage: "https://github.com/YouMind-OpenLab/awesome-gemini-3-prompts",
    kind: "youmind-readme",
    media: "image",
    modelId: "gemini-3",
    tag: "gemini",
    url: "https://cdn.jsdelivr.net/gh/YouMind-OpenLab/awesome-gemini-3-prompts@main/README_zh.md",
  },
  {
    id: "ericgood-seedance",
    label: "Seedance 画廊",
    homepage: "https://github.com/Ericgood/seedance-prompt",
    kind: "ericgood-video",
    media: "video",
    url: "https://cdn.jsdelivr.net/gh/Ericgood/seedance-prompt@main/prompts.json",
  },
  {
    id: "domer",
    label: "Domer",
    homepage: "https://domer.io/explore",
    kind: "domer-explore",
    media: "mixed",
    url: "https://domer.io/api/explore",
  },
  {
    id: "domer-kling",
    label: "Domer Kling",
    homepage: "https://domer.io/explore",
    kind: "domer-explore",
    media: "video",
    modelFilter: "kling",
    url: "https://domer.io/api/explore",
  },
  {
    id: "domer-seedance",
    label: "Domer Seedance",
    homepage: "https://domer.io/explore",
    kind: "domer-explore",
    media: "video",
    modelFilter: "seedance",
    url: "https://domer.io/api/explore",
  },
  {
    id: "domer-grok",
    label: "Domer Grok",
    homepage: "https://domer.io/explore",
    kind: "domer-explore",
    media: "video",
    modelFilter: "grok",
    url: "https://domer.io/api/explore",
  },
  {
    id: "domer-veo",
    label: "Domer Veo",
    homepage: "https://domer.io/explore",
    kind: "domer-explore",
    media: "video",
    modelFilter: "veo",
    url: "https://domer.io/api/explore",
  },
  {
    id: "civitai-hot",
    label: "Civitai Highest Rated",
    homepage: "https://civitai.com/models",
    kind: "civitai-models",
    media: "image",
    civitaiSort: "Highest Rated",
    url: "https://civitai.com/api/v1/models",
  },
  {
    id: "civitai-download",
    label: "Civitai Most Downloaded",
    homepage: "https://civitai.com/models?sort=Most+Downloaded",
    kind: "civitai-models",
    media: "image",
    civitaiSort: "Most Downloaded",
    url: "https://civitai.com/api/v1/models",
  },
  {
    id: "civitai-newest",
    label: "Civitai Newest",
    homepage: "https://civitai.com/models?sort=Newest",
    kind: "civitai-models",
    media: "image",
    civitaiSort: "Newest",
    url: "https://civitai.com/api/v1/models",
  },
  {
    id: "civitai-lora",
    label: "Civitai LoRA",
    homepage: "https://civitai.com/models?types=LORA",
    kind: "civitai-models",
    media: "image",
    civitaiSort: "Highest Rated",
    civitaiTypes: "LORA",
    url: "https://civitai.com/api/v1/models",
  },
  {
    id: "pixai-hot",
    label: "PixAI 热门",
    homepage: "https://pixai.art/zh/market",
    kind: "pixai-market",
    media: "image",
    pixaiSort: "hot",
    url: "https://api.pixai.art/graphql",
  },
  {
    id: "pixai-newest",
    label: "PixAI 最新",
    homepage: "https://pixai.art/zh/market?sort=newest",
    kind: "pixai-market",
    media: "image",
    pixaiSort: "newest",
    url: "https://api.pixai.art/graphql",
  },
];

export function findPromptSource(id: string): PromptSourceDef | undefined {
  const key = id.trim();
  return PROMPT_SOURCES.find((s) => s.id === key);
}
