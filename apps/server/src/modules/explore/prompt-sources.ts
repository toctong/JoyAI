/** Built-in remote prompt libraries for explore「提示词库」. */

export type PromptSourceKind =
  | "yukkcat"
  | "xianyu-json"
  | "tigerowo-cases"
  | "davidwu-json"
  | "xianyu-gallery"
  | "hiapi-seedance"
  | "ericgood-video";

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
    id: "hiapi-seedance-2",
    label: "Seedance 视频",
    homepage: "https://github.com/HiAPIAI/awesome-seedance-2-0-prompts",
    kind: "hiapi-seedance",
    media: "video",
    url: "https://cdn.jsdelivr.net/gh/HiAPIAI/awesome-seedance-2-0-prompts@main/data/prompts.json",
  },
  {
    id: "ericgood-seedance",
    label: "Seedance 画廊",
    homepage: "https://github.com/Ericgood/seedance-prompt",
    kind: "ericgood-video",
    media: "video",
    url: "https://cdn.jsdelivr.net/gh/Ericgood/seedance-prompt@main/prompts.json",
  },
];

export function findPromptSource(id: string): PromptSourceDef | undefined {
  const key = id.trim();
  return PROMPT_SOURCES.find((s) => s.id === key);
}
