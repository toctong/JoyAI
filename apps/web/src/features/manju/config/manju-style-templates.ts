/** 漫剧风格模板：选中后写入 settings.style（可再手工改） */

export type ManjuStyleTemplate = {
  id: string;
  label: string;
  /** 写入提示词的完整风格句 */
  prompt: string;
};

export const STYLE_TEMPLATES: ManjuStyleTemplate[] = [
  {
    id: "cinematic",
    label: "电影感写实",
    prompt: "电影感写实，自然光影，细腻皮肤质感，电影级构图",
  },
  {
    id: "ink",
    label: "暗色水墨",
    prompt: "暗色水墨国风，留白意境，墨色层次，东方叙事插画感",
  },
  {
    id: "anime",
    label: "日系动漫",
    prompt: "日系动漫二次元，清晰线稿，鲜明色块，少女漫画光影",
  },
  {
    id: "cyberpunk",
    label: "赛博朋克",
    prompt: "赛博朋克霓虹，湿润街道反射，高对比冷暖光，未来都市",
  },
  {
    id: "guofeng",
    label: "国风工笔",
    prompt: "国风工笔重彩，细腻衣纹，古典构图，雅致色调",
  },
  {
    id: "render3d",
    label: "3D 渲染",
    prompt: "高质量 3D 渲染，次表面散射皮肤，电影灯光，虚幻引擎质感",
  },
  {
    id: "webtoon",
    label: "竖屏漫剧",
    prompt: "竖屏彩色漫剧分镜感，清晰人物，干净背景，适合短视频竖屏",
  },
  {
    id: "xianxia",
    label: "仙侠奇幻",
    prompt: "仙侠奇幻，飘逸衣袂，灵气光效，云雾山峦，东方奇幻美学",
  },
];

export function styleTemplateById(
  id: string | undefined | null,
): ManjuStyleTemplate | undefined {
  if (!id) return undefined;
  return STYLE_TEMPLATES.find((t) => t.id === id);
}

/** 按风格文案反查模板；对不上则视为自定义 */
export function styleIdFromPrompt(
  style: string | undefined | null,
): string | undefined {
  const text = style?.trim();
  if (!text) return undefined;
  return STYLE_TEMPLATES.find((t) => t.prompt === text || t.label === text)?.id;
}
