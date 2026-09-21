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
  /** Driving / reference videos the user must upload. */
  videosRequired?: number;
  /** Max reference videos. */
  videosMax?: number;
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
  /** Click-to-fill example notes shown under the textarea. */
  examples?: string[];
  /** When true, user must fill the note (e.g. brand name / brief). */
  noteRequired?: boolean;
  /** How to merge note into the job prompt. */
  promptMode?: "append-note" | "brand-brief";
};

export const AI_TOOL_CATEGORIES: {
  id: AiToolCategory;
  label: string;
}[] = [
  { id: "image", label: "影像创作" },
  { id: "video", label: "动画创作" },
  { id: "other", label: "其他工具" }
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
    examples: ["海边日落，手写「想你」", "咖啡馆窗边，日期在下"],
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
    examples: ["柔光展示柜，高级涂装", "动感姿势，深色景盒"],
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
    examples: ["VOGUE 风格，大标题在上", "独立杂志封面，极简排版"],
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
    examples: ["站姿立牌，透明支架", "坐姿 Q 版，可爱表情"],
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
    examples: ["圆形徽章，金属边", "方形炫彩，漂亮漆"],
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
    examples: ["SSR 收藏卡", "限定版卡面，全息边"],
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
    examples: ["超柔毛绒，圆润眼睛", "小巧挂件尺寸"],
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
    examples: ["「星星」牌面", "「恋人」牌面"],
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
    examples: ["坐桌角小物，胚型感", "摇摇乐表情"],
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
    examples: ["三视图 + 表情小样", "服装细节标注"],
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
    examples: ["红色剪纸风", "多层纸艺，投影"],
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
    examples: ["经典积木颜色", "迷你塔风格人偶"],
    prompt:
      "Rebuild the character from the reference as a plastic brick minifigure / brick-built figure. Studs and brick seams visible, toy plastic materials, studio lighting, still recognizable colors and costume cues, playful product shot.",
  },
  {
    slug: "motion-mimic",
    name: "动作模仿",
    description:
      "上传一张角色图和一段动作视频，让图里的角色跟着视频做同样的动作。",
    category: "video",
    status: "available",
    kind: "video",
    refsRequired: 1,
    refsMax: 1,
    videosRequired: 1,
    videosMax: 1,
    ratio: "16:9",
    accent: "#74c0fc",
    covers: [
      "/tools/cover-ai-hug-0.webp",
      "/tools/cover-ai-hug-1.webp",
      "/tools/cover-ai-hug-2.webp",
    ],
    tags: ["视频", "动作"],
    badge: "new",
    prompt:
      "Motion transfer: the character in the reference image performs the same body movement, timing, and gesture as the driving reference video. Keep the image subject's face, hairstyle, outfit, body proportions, and art style. Do not copy the identity of the person in the driving video. Stable limbs, natural motion, coherent lighting, no extra people, no text, no watermark.",
    examples: ["舞蹈跟拍", "走路转身", "挥手打招呼"],
    noteHint: "可写镜头或场景，例如「舞蹈跟拍 / 走路转身」。动作以参考视频为准。",
  },
  {
    slug: "ai-kiss",
    name: "AI 接吻影片",
    description: "上传两张角色图，生成自然亲吻短片，两边长相都保持不变。",
    category: "video",
    status: "available",
    kind: "video",
    refsRequired: 2,
    refsMax: 2,
    ratio: "16:9",
    accent: "#e891a8",
    covers: [
      "/tools/cover-ai-kiss-0.webp",
      "/tools/cover-ai-kiss-1.webp",
      "/tools/cover-ai-kiss-2.webp",
    ],
    tags: ["视频", "互动"],
    badge: "new",
    prompt:
      "Create a short cinematic video of the two people from the two reference images sharing a gentle, natural kiss. Keep each face, hair, and outfit recognizable and distinct. Soft lighting, medium close-up, smooth motion, no third person, no text, no watermark.",
    examples: ["侧脸轻吻", "雨中亲吻", "慢镜头特写"],
    noteHint: "可写镜头，例如「侧脸轻吻 / 雨中亲吻」。",
  },
  {
    slug: "ai-hug",
    name: "AI 拥抱影片",
    description: "把角色图变成温暖拥抱短片。一张图是单人入镜，两张图是两人互拥。",
    category: "video",
    status: "available",
    kind: "video",
    refsRequired: 1,
    refsMax: 2,
    ratio: "16:9",
    accent: "#f0b4a0",
    covers: [
      "/tools/cover-ai-hug-0.webp",
      "/tools/cover-ai-hug-1.webp",
      "/tools/cover-ai-hug-2.webp",
    ],
    tags: ["视频", "互动"],
    badge: "new",
    prompt:
      "Create a short warm video of a natural hug. If two reference images are provided, those two characters hug each other and both identities stay clear. If only one reference is provided, that character gives a gentle hug while staying recognizable. Coherent lighting, smooth motion, no extra people, no text, no watermark.",
    examples: ["朋友拥抱", "久别重逢", "侧身环抱"],
    noteHint: "可写关系或镜头，例如「朋友拥抱 / 久别重逢」。",
  },
  {
    slug: "upscale",
    name: "影像高画质",
    description:
      "上传一张图，按 2× 或 4× 提升解析度，尽量保住脸、线条和原有构图。该能力需要独立的放大任务，目前还不能用普通生图代替。",
    category: "other",
    status: "coming_soon",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    accent: "#8ab4d4",
    covers: [
      "/tools/cover-upscale-0.webp",
      "/tools/cover-upscale-1.webp",
      "/tools/cover-upscale-2.webp",
    ],
    tags: ["放大", "修复"],
    examples: ["2× 清晰", "4× 细节"],
    noteHint: "上线后可选 2× 或 4×。不会改画风，也不会重画人物。",
    prompt: "",
  },

  {
    slug: "website-logo",
    name: "网站 Logo 生成器",
    description: "填写品牌名与风格，一键生成可作网站标识 / Favicon 的简洁 Logo 图形。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 0,
    refsMax: 1,
    ratio: "1:1",
    accent: "#3d7eff",
    covers: ["/tools/cover-badge-0.webp", "/tools/cover-badge-1.webp", "/tools/cover-badge-2.webp"],
    tags: ["品牌", "Favicon"],
    badge: "new",
    noteRequired: true,
    promptMode: "brand-brief",
    prompt:
      "Design a professional website logo mark (icon / brand glyph only, no long paragraph text). Flat vector style, bold silhouette, readable at 16px favicon size, centered composition, generous padding, clean edges. Prefer transparent or solid neutral studio background. Avoid photorealism, 3D render, purple neon glow, cluttered detail, watermarks, and mockups of browsers or devices. Output a single logo mark suitable for app icon and website favicon.",
    examples: ["JoyAI，创意 AI 影像工具，极简几何", "Nova，科技创业，蓝绿渐变"],
    noteHint: "必填：品牌名 + 行业/气质，例如「JoyAI，创意 AI 影像工具，极简几何」；可写配色偏好。",
  },
  {
    slug: "website-wordmark",
    name: "网站标题 Logo 生成器",
    description: "生成带网站标题的组合 Logo（图形 + 字标），适合站点顶栏与登录页。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 0,
    refsMax: 1,
    ratio: "16:9",
    accent: "#1f6feb",
    covers: ["/tools/cover-trading-card-0.webp", "/tools/cover-trading-card-1.webp", "/tools/cover-trading-card-2.webp"],
    tags: ["品牌", "字标"],
    badge: "new",
    noteRequired: true,
    promptMode: "brand-brief",
    prompt:
      "Design a professional website combination logo: a compact symbol mark beside or above a clean wordmark of the brand name. Horizontal lockup preferred, balanced spacing, modern sans-serif lettering, high legibility. Flat vector brand-identity style, solid or transparent background, no device mockups, no browser chrome, no purple neon glow, no photorealism. Suitable for website header and login splash. Keep the wordmark spelling accurate to the brand brief.",
    examples: ["JoyAI · 创意工作室工作台，黑白极简", "Lumen Studio，现代无衬线"],
    noteHint: "必填：完整网站标题/品牌名，可加气质，例如「JoyAI · 创意工作室工作台，黑白极简」。",
  },

  {
    slug: "photo-fail",
    name: "素人失败照九宫格",
    description: "上传角色图，一键变成九宫格素人抓拍失败照，适合趣味分享。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#e8a0bf",
    covers: ["/tools/cover-character-sheet-0.webp", "/tools/cover-character-sheet-1.webp", "/tools/cover-character-sheet-2.webp"],
    tags: ["九宫格", "趣味"],
    badge: "new",
    prompt:
      "Create a 3x3 grid collage of the same character from the reference, each cell a candid 'failed amateur selfie' moment: awkward angles, blink mid-shot, motion blur, bad flash, finger covering lens, double chin angle, unexpected background stranger. Keep identity consistent. Soft phone-camera look, natural skin, no text overlays, no watermarks. Clean thin gutters between cells.",
    examples: ["夜店闪光灯", "健身房自拍", "路人入镜"],
    noteHint: "可写想要的失败姿势或场景，例如「夜店闪光灯 / 健身房自拍」。",
  },
  {
    slug: "lineart",
    name: "图片转线稿",
    description: "把彩色插画转成干净黑白线稿，适合漫画线框或再上色。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#2a2a2a",
    covers: ["/tools/cover-paper-cutout-0.webp", "/tools/cover-paper-cutout-1.webp", "/tools/cover-paper-cutout-2.webp"],
    tags: ["线稿", "漫画"],
    badge: "new",
    prompt:
      "Convert the reference image into clean black-and-white line art / anime lineart. Crisp ink outlines, minimal shading, pure white background, no color fills, no screentone, no gray wash. Preserve character proportions and key details. Suitable as a coloring base.",
    examples: ["极细线", "粗墨线", "赛璐璐勾线"],
    noteHint: "可指定线稿风格，例如「极细线 / 粗墨线 / 赛璐璐勾线」。",
  },
  {
    slug: "sketch-colorize",
    name: "线稿上色",
    description: "上传黑白线稿或素描，一键自动上色并保留线框。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#7c6cf0",
    covers: ["/tools/cover-paper-cutout-1.webp", "/tools/cover-paper-cutout-0.webp", "/tools/cover-paper-cutout-2.webp"],
    tags: ["上色", "线稿"],
    badge: "new",
    prompt:
      "Colorize the uploaded line art / sketch while keeping the original outlines. Cel-shading or soft anime coloring, coherent palette, clean flats with light shadows. Do not redraw anatomy drastically; fill colors inside the lines. White or simple studio background unless the sketch already defines a scene.",
    examples: ["莫兰迪马卡龙", "赛博霓虹"],
    noteHint: "可写配色偏好，例如「莫兰迪马卡龙 / 赛博霓虹」。",
  },
  {
    slug: "sticker",
    name: "贴纸表情包",
    description: "把角色做成带白边的可爱贴纸 / 表情包，适合聊天发送。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#ff7eb3",
    covers: ["/tools/cover-badge-0.webp", "/tools/cover-badge-1.webp", "/tools/cover-badge-2.webp"],
    tags: ["贴纸", "表情包"],
    badge: "new",
    prompt:
      "Turn the character from the reference into a die-cut sticker: big cute expression, thick white sticker border, subtle drop shadow, centered on a solid pastel background. Chibi-friendly proportions OK. Bold readable silhouette, no tiny text, no watermark. Telegram/WhatsApp sticker aesthetic.",
    examples: ["害羞比心", "暴怒", "睡眼冒气"],
    noteHint: "可写表情或文案氛围，例如「害羞比心 / 暴怒」。",
  },
  {
    slug: "pixel-art",
    name: "像素画生成器",
    description: "一键把角色变成复古像素风，适合头像与游戏素材感。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#39c5bb",
    covers: ["/tools/cover-lego-0.webp", "/tools/cover-lego-1.webp", "/tools/cover-lego-2.webp"],
    tags: ["像素", "复古"],
    badge: "new",
    prompt:
      "Convert the reference subject into crisp 16-bit / 32-bit pixel art. Limited palette, visible pixels, no anti-alias blur, clean silhouette, game-sprite vibe. Keep identity recognizable. Solid simple background. Avoid photorealism and smooth gradients.",
    examples: ["32x32 头像风", "街机立绘"],
    noteHint: "可写分辨率感觉，例如「32x32 头像风 / 街机立绘」。",
  },
  {
    slug: "chibi-avatar",
    name: "Q版头像生成器",
    description: "生成圆润可爱的 Q 版头像，适合社交媒体与群头像。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#ffb4a2",
    covers: ["/tools/cover-desktop-pet-0.webp", "/tools/cover-desktop-pet-1.webp", "/tools/cover-desktop-pet-2.webp"],
    tags: ["头像", "Q版"],
    badge: "new",
    prompt:
      "Create a chibi / Q-version avatar portrait of the reference character: oversized head, small body or bust, big sparkling eyes, soft pastel colors, clean circular-friendly composition, centered face. Cute sticker-illustration style, simple background, high clarity for profile picture use.",
    examples: ["冷静学霸", "软萌奶凶"],
    noteHint: "可写气质，例如「冷静学霸 / 软萌奶凶」。",
  },
  {
    slug: "id-photo",
    name: "证件照生成器",
    description: "把人像整理成干净证件照风格，可指定背景色。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#4c6ef5",
    covers: ["/tools/cover-polaroid-0.webp", "/tools/cover-polaroid-1.webp", "/tools/cover-polaroid-2.webp"],
    tags: ["证件照", "人像"],
    badge: "new",
    prompt:
      "Generate a professional ID / passport-style portrait from the reference person. Straight posture, neutral soft smile or calm expression, even studio lighting, sharp facial detail, formal clothing if unclear. Solid color background (default light blue-gray). No accessories that obscure face, no artistic filters, no text.",
    examples: ["白底正装", "蓝底衬衫", "红底素颜"],
    noteHint: "可写背景色与服装，例如「白底正装 / 红底衬衫」。",
  },
  {
    slug: "social-poster",
    name: "海报封面生成器",
    description: "按文案生成小红书 / 活动海报封面，可上传产品或角色参考。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 0,
    refsMax: 2,
    ratio: "3:4",
    accent: "#ff6b6b",
    covers: ["/tools/cover-magazine-cover-0.webp", "/tools/cover-magazine-cover-1.webp", "/tools/cover-magazine-cover-2.webp"],
    tags: ["海报", "封面"],
    badge: "new",
    noteRequired: true,
    promptMode: "brand-brief",
    prompt:
      "Design a polished social-media poster / cover image. Strong focal subject, clear visual hierarchy, modern Chinese lifestyle or creative-studio aesthetic when appropriate. Leave readable space for a short title if implied by the brief. High contrast, clean composition, no browser chrome, no watermarks, no purple neon cliché glow. Suitable for Xiaohongshu or event promotion.",
    examples: ["春季上新 · 极简奶油风", "限时活动，高对比海报"],
    noteHint: "必填：标题/主题 + 风格，例如「春季上新 · 极简奶油风」。",
  },
  {
    slug: "expression-swap",
    name: "表情转换器",
    description: "保留角色长相，只改表情（笑、哭、惊讶、生气等）。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#fab005",
    covers: ["/tools/cover-character-sheet-1.webp", "/tools/cover-character-sheet-0.webp", "/tools/cover-character-sheet-2.webp"],
    tags: ["表情", "角色"],
    badge: "new",
    noteRequired: true,
    promptMode: "brand-brief",
    prompt:
      "Keep the same character identity, hairstyle, outfit, and framing as the reference. Only change the facial expression according to the user brief. Natural facial muscles, consistent art style and lighting. Do not change age, gender presentation, or background dramatically.",
    examples: ["害羞捂脸", "爆哭", "坏笑"],
    noteHint: "必填目标表情，例如「害羞捂脸 / 爆哭 / 坏笑」。",
  },
  {
    slug: "vhs-retro",
    name: "VHS 复古生成器",
    description: "复古录像带质感：扫描线、色差与夜间录像氛围。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "4:3",
    accent: "#845ef7",
    covers: ["/tools/cover-polaroid-2.webp", "/tools/cover-magazine-cover-0.webp", "/tools/cover-polaroid-1.webp"],
    tags: ["复古", "VHS"],
    badge: "new",
    prompt:
      "Restyle the reference into authentic VHS / camcorder footage: soft CRT scanlines, slight chromatic aberration, tape grain, muted 90s color cast, timestamp optional only if it does not cover the face. Keep subject identity. Nostalgic night-or-indoor home-video mood. No modern UI overlays.",
    examples: ["90 年代卡拉 OK", "校园春游"],
    noteHint: "可写年代或场景，例如「90 年代卡拉 OK / 校园春游」。",
  },
  {
    slug: "galgame-ui",
    name: "Galgame 界面生成器",
    description: "把角色放进恋爱游戏对话界面：立绘 + 对话框氛围。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "16:9",
    accent: "#f783ac",
    covers: ["/tools/cover-magazine-cover-1.webp", "/tools/cover-magazine-cover-2.webp", "/tools/cover-magazine-cover-0.webp"],
    tags: ["Galgame", "界面"],
    badge: "new",
    prompt:
      "Compose a visual-novel / galgame screenshot: the reference character as a standing sprite on the left or right, soft painted background, classic dialogue box at the bottom with placeholder nameplate and a short line of readable dialogue text matching the mood. Polished anime VN UI, not a phone mockup. Keep character identity.",
    examples: ["「……今晚月色真美。」", "角色名：霞"],
    noteHint: "可写角色名与台词，例如「「……今晚月色真美。」」。",
  },
  {
    slug: "landmark-statue",
    name: "巨型雕像生成器",
    description: "把角色变成城市地标级巨型雕像，游客仰拍视角。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#868e96",
    covers: ["/tools/cover-figure-0.webp", "/tools/cover-figure-1.webp", "/tools/cover-figure-2.webp"],
    tags: ["雕像", "地标"],
    badge: "new",
    prompt:
      "Transform the reference character into a colossal city landmark statue. Low-angle tourist photo, bronze or stone material with realistic weathering, plaza crowds for scale, dramatic daylight, photoreal environment. Keep the character silhouette and signature features recognizable as a monument.",
    examples: ["青铜像", "东京街头"],
    noteHint: "可写材质或城市，例如「青铜像 / 东京街头」。",
  },
  {
    slug: "couple-interaction",
    name: "双人互动生成器",
    description: "上传两名角色，生成自然亲密的互动合影（拥抱、击掌等）。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 2,
    refsMax: 2,
    ratio: "3:4",
    accent: "#ff8787",
    covers: ["/tools/cover-ai-hug-0.webp", "/tools/cover-ai-hug-1.webp", "/tools/cover-ai-hug-2.webp"],
    tags: ["双人", "互动"],
    badge: "new",
    prompt:
      "Create a natural two-character interaction scene using both references as the two subjects. Preserve each identity clearly. Warm friendly pose (hug, high-five, walking side by side, or leaning together depending on the note). Coherent lighting and shared art style, cinematic medium shot. No third character, no text.",
    examples: ["击掌庆祝", "雨中共伞"],
    noteHint: "可写互动动作，例如「击掌庆祝 / 雨中共伞」。",
  },
  {
    slug: "watercolor",
    name: "水彩肖像生成器",
    description: "把照片或插画转成柔和水彩肖像，适合封面与印刷感。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "3:4",
    accent: "#74c0fc",
    covers: ["/tools/cover-tarot-card-0.webp", "/tools/cover-tarot-card-1.webp", "/tools/cover-tarot-card-2.webp"],
    tags: ["水彩", "肖像"],
    badge: "new",
    prompt:
      "Repaint the reference as a delicate watercolor portrait on textured paper. Soft pigment blooms, visible brush edges, gentle color bleeding, preserved likeness. Artistic but readable face. Leave subtle paper grain; avoid photoreal CGI and heavy digital airbrush.",
    examples: ["靛蓝冷水彩", "暖橙日落"],
    noteHint: "可写色调，例如「靛蓝冷水彩 / 暖橙日落」。",
  },
  {
    slug: "emoji-face",
    name: "Emoji 表情生成器",
    description: "把角色脸做成圆润光泽的 Emoji 风格表情符号。",
    category: "image",
    status: "available",
    kind: "image",
    refsRequired: 1,
    refsMax: 1,
    ratio: "1:1",
    accent: "#ffd43b",
    covers: ["/tools/cover-badge-2.webp", "/tools/cover-badge-0.webp", "/tools/cover-badge-1.webp"],
    tags: ["Emoji", "表情"],
    badge: "new",
    prompt:
      "Turn the reference face into a single glossy round emoji-style icon. Soft 3D plastic shading like modern phone emoji, simplified features, big readable expression, circular crop-friendly, solid simple background. Keep hair color / signature traits lightly recognizable without breaking emoji simplicity.",
    noteHint: "可写表情，例如「得意眨眼 / 石化无语」。",
  }
];

export function getAiTool(slug: string): AiToolDef | undefined {
  return AI_TOOLS.find((tool) => tool.slug === slug);
}

export function buildAiToolPrompt(tool: AiToolDef, note?: string) {
  const extra = note?.trim();
  if (!extra) return tool.prompt;
  if (tool.promptMode === "brand-brief") {
    return [
      tool.prompt,
      "",
      "Brand brief from user (authoritative for name, industry, tone, colors):",
      extra.slice(0, 500),
      "",
      "If a reference image is provided, use it only as a loose style/mood reference; do not copy existing trademarks.",
    ].join("\n");
  }
  return `${tool.prompt}

User note: ${extra.slice(0, 500)}`;
}


export function getToolExamples(tool: AiToolDef): string[] {
  if (tool.examples?.length) {
    return tool.examples.filter((item) => item.trim()).slice(0, 4);
  }
  const hint = tool.noteHint ?? "";
  const quoted = [...hint.matchAll(/[「『]([^」』]+)[」』]/g)].flatMap((match) =>
    match[1]
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return quoted.slice(0, 4);
}

export function toolsByCategory(category: AiToolCategory) {
  return AI_TOOLS.filter((tool) => tool.category === category);
}
