/**
 * JoyAI AI Tools catalog.
 * Product shape inspired by specialty i2i “tool per page” markets (e.g. PixAI tools),
 * rewritten for JoyAI: BullMQ jobs + reference assets, no pasted third-party modules.
 */

export type AiToolCategory = "image" | "video" | "other";

export type AiToolStatus = "available" | "coming_soon";

export type AiToolDef = {
  slug: string;
  name: string;
  description: string;
  category: AiToolCategory;
  status: AiToolStatus;
  /** Job kind submitted by this tool. */
  kind: "image" | "video";
  /** How many reference images the user must upload. */
  refsRequired: number;
  /** Max reference images. */
  refsMax: number;
  /** Default aspect for the job. */
  ratio?: string;
  /** Accent for card art (CSS color). */
  accent: string;
  /** Catalog card covers (back / mid / face) under /public/tools. */
  covers?: string[];
  tags: string[];
  /** Optional corner badge on the catalog card. */
  badge?: "new";
  /** Prompt when the user only uploads refs (no extra note). */
  prompt: string;
  /** Extra instruction when the user typed a note. */
  noteHint?: string;
};

export const AI_TOOL_CATEGORIES: {
  id: AiToolCategory;
  label: string;
}[] = [
  { id: "image", label: "影像创作" },
  { id: "video", label: "动画创作" },
  { id: "other", label: "其他工具" },
];

/**
 * Prompt templates keep subject identity from the reference and apply a fixed scene.
 * Pattern reference (not copied): template + subject i2i flows used by open magazine/polaroid demos.
 */
export const AI_TOOLS: AiToolDef[] = [
  {
    slug: "polaroid",
    name: "拍立得生成器",
    description: "上传角色图，一键变成带白边与手写感的拍立得照片。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#e8c4a8",
    covers: ["/tools/cover-polaroid-0.webp", "/tools/cover-polaroid-1.webp", "/tools/cover-polaroid-2.webp"],
    tags: ["周边", "复古"],
    badge: "new",
    prompt:
      "Transform the subject from the reference image into a vintage Polaroid instant photo. Keep the face, hair, outfit, and identity. Soft flash lighting, slight film grain, thick white Polaroid border, handwritten caption space at the bottom, nostalgic snapshot aesthetic, high detail.",
    noteHint: "可写拍立得底部想出现的短句或场景。",
  },
  {
    slug: "figure",
    name: "公仔生成器",
    description: "把插画或角色变成精致桌面公仔，保留外形与服装细节。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#9fd4c4",
    covers: ["/tools/cover-figure-0.webp", "/tools/cover-figure-1.webp", "/tools/cover-figure-2.webp"],
    tags: ["手办", "3D"],
    badge: "new",
    prompt:
      "Turn the character in the reference into a collectible anime figure on a simple display stand. Preserve hairstyle, costume, colors, and face. Smooth PVC material, studio product lighting, clean backdrop, sharp sculpt details, commercial toy photography.",
  },
  {
    slug: "magazine-cover",
    name: "杂志封面生成器",
    description: "让角色登上时尚杂志封面，保留画风与人物特征。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#d4a5c9",
    covers: ["/tools/cover-magazine-cover-0.webp", "/tools/cover-magazine-cover-1.webp", "/tools/cover-magazine-cover-2.webp"],
    tags: ["封面", "时尚"],
    prompt:
      "Create a glossy fashion magazine cover starring the person from the reference. Keep identity and costume. Magazine masthead typography, cover lines, bold editorial pose, professional studio lighting, print cover composition, high-end fashion photography look.",
    noteHint: "可写杂志名或封面文案方向。",
  },
  {
    slug: "acrylic-standee",
    name: "立牌生成器",
    description: "一键做成亚克力立牌效果，适合角色周边预览。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#a8c5e8",
    covers: ["/tools/cover-acrylic-standee-0.webp", "/tools/cover-acrylic-standee-1.webp", "/tools/cover-acrylic-standee-2.webp"],
    tags: ["周边", "立牌"],
    prompt:
      "Convert the character from the reference into a clear acrylic standee product photo. Full-body or three-quarter cutout with a transparent acrylic base, soft reflections, clean white/light gray studio background, merchandise catalog style, preserve all character details.",
  },
  {
    slug: "badge",
    name: "徽章生成器",
    description: "把角色头像做成圆形徽章，适合周边与头像框。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#f0c987",
    covers: ["/tools/cover-badge-0.webp", "/tools/cover-badge-1.webp", "/tools/cover-badge-2.webp"],
    tags: ["徽章", "头像"],
    prompt:
      "Design a circular enamel pin / badge featuring the character from the reference as a bust portrait. Metal rim, glossy finish, centered composition, clean background, collectible merchandise look, preserve face and signature colors.",
  },
  {
    slug: "trading-card",
    name: "收藏卡牌生成器",
    description: "生成高质感收藏卡，保留画风并带稀有度边框感。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "2:3",
    accent: "#c9b4f0",
    covers: ["/tools/cover-trading-card-0.webp", "/tools/cover-trading-card-1.webp", "/tools/cover-trading-card-2.webp"],
    tags: ["卡牌", "收藏"],
    prompt:
      "Create a premium trading card of the character from the reference. Keep identity and art style. Ornate holographic border, card title bar, rarity shimmer accents, centered portrait, collectible TCG layout, sharp print detail.",
    noteHint: "可写卡牌名称或稀有度（如 SSR）。",
  },
  {
    slug: "plushie",
    name: "棉花娃娃生成器",
    description: "把角色变成可爱立体棉花娃娃，柔软质感一眼能认。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#f2b8c6",
    covers: ["/tools/cover-plushie-0.webp", "/tools/cover-plushie-1.webp", "/tools/cover-plushie-2.webp"],
    tags: ["棉花娃娃", "软萌"],
    prompt:
      "Turn the character in the reference into a soft plush doll / cotton doll. Soft fabric texture, stitched seams, button eyes if appropriate, cute proportions, seated on a clean surface, product photography, still recognizable as the same character.",
  },
  {
    slug: "tarot-card",
    name: "塔罗牌生成器",
    description: "一键生成专属塔罗卡风格，适合角色周边收藏。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "2:3",
    accent: "#8e7cc3",
    covers: ["/tools/cover-tarot-card-0.webp", "/tools/cover-tarot-card-1.webp", "/tools/cover-tarot-card-2.webp"],
    tags: ["塔罗", "神秘"],
    prompt:
      "Illustrate a full tarot card starring the character from the reference. Mystical border, symbolic background motifs, classical tarot composition, rich colors, gold line accents, keep the character identity clear, collectible card art.",
    noteHint: "可写牌面名称（如「星星」「恋人」）。",
  },
  {
    slug: "desktop-pet",
    name: "桌宠生成器",
    description: "把角色收成桌面桌宠风格，保留服装与表情。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#7ec8e3",
    covers: ["/tools/cover-desktop-pet-0.webp", "/tools/cover-desktop-pet-1.webp", "/tools/cover-desktop-pet-2.webp"],
    tags: ["桌宠", "Q版"],
    prompt:
      "Redraw the character from the reference as a cute desktop pet chibi mascot. Simple transparent-looking desk scene, soft shading, friendly expression, compact pose, preserve outfit colors and signature features, digital companion sticker vibes.",
  },
  {
    slug: "character-sheet",
    name: "角色设定图生成器",
    description: "生成角色设定向展示图，突出造型层次与细节。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "16:9",
    accent: "#b8d4a8",
    covers: ["/tools/cover-character-sheet-0.webp", "/tools/cover-character-sheet-1.webp", "/tools/cover-character-sheet-2.webp"],
    tags: ["设定", "三视图"],
    prompt:
      "Create a character design sheet from the reference character. Clean model-sheet layout with front view emphasis, optional side/back suggestions in one image, turnaround vibe, neutral gray background, clear costume callouts, concept art presentation, preserve identity.",
  },
  {
    slug: "paper-cutout",
    name: "人物剪纸生成器",
    description: "把角色或 OC 转成独特剪纸风格画面。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#e09a7a",
    covers: ["/tools/cover-paper-cutout-0.webp", "/tools/cover-paper-cutout-1.webp", "/tools/cover-paper-cutout-2.webp"],
    tags: ["剪纸", "风格化"],
    prompt:
      "Recreate the character from the reference as layered paper cutout art. Visible paper edges, soft shadows between layers, craft-paper textures, silhouette clarity, preserve hairstyle and costume colors, handcrafted paper craft aesthetic.",
  },
  {
    slug: "lego",
    name: "积木人偶生成器",
    description: "一键把角色变成积木人偶风格，保留标志配色。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#f5d76e",
    covers: ["/tools/cover-lego-0.webp", "/tools/cover-lego-1.webp", "/tools/cover-lego-2.webp"],
    tags: ["积木", "玩具"],
    prompt:
      "Rebuild the character from the reference as a plastic brick minifigure / brick-built figure. Studs and brick seams visible, toy plastic materials, studio lighting, still recognizable colors and costume cues, playful product shot.",
  },
  {
    slug: "ai-kiss",
    name: "AI 接吻影片",
    description: "上传两张角色图，生成自然亲吻短片（即将上线）。",
    category: "video",
    status: "coming_soon",
    kind: "video",
    refsRequired: 2,
    refsMax: 2,
    accent: "#e891a8",
    covers: ["/tools/cover-ai-kiss-0.webp", "/tools/cover-ai-kiss-1.webp", "/tools/cover-ai-kiss-2.webp"],
    tags: ["视频", "互动"],
    prompt: "",
  },
  {
    slug: "ai-hug",
    name: "AI 拥抱影片",
    description: "把静态角色图变成温暖拥抱短片（即将上线）。",
    category: "video",
    status: "coming_soon",
    kind: "video",
    refsRequired: 1,
    refsMax: 2,
    accent: "#f0b4a0",
    covers: ["/tools/cover-ai-hug-0.webp", "/tools/cover-ai-hug-1.webp", "/tools/cover-ai-hug-2.webp"],
    tags: ["视频", "互动"],
    prompt: "",
  },
  {
    slug: "upscale",
    name: "影像高画质",
    description: "一键提升解析度并尽量保持细节（即将上线）。",
    category: "other",
    status: "coming_soon",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    accent: "#8ab4d4",
    covers: ["/tools/cover-upscale-0.webp", "/tools/cover-upscale-1.webp", "/tools/cover-upscale-2.webp"],
    tags: ["放大", "修复"],
    prompt: "",
  },
];

export function getAiTool(slug: string): AiToolDef | undefined {
  return AI_TOOLS.find((tool) => tool.slug === slug);
}

export function buildAiToolPrompt(tool: AiToolDef, note?: string) {
  const extra = note?.trim();
  if (!extra) return tool.prompt;
  return `${tool.prompt}\n\nUser note: ${extra.slice(0, 500)}`;
}

export function toolsByCategory(category: AiToolCategory) {
  return AI_TOOLS.filter((tool) => tool.category === category);
}
