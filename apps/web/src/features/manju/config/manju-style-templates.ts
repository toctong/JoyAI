/** 漫剧风格模板：选中后写入 settings.style（可再手工改） */

export type ManjuStyleTemplate = {
  id: string;
  label: string;
  /** 写入提示词的完整风格句 */
  prompt: string;
  /** 封面图（public 路径） */
  thumb: string;
  /** 无封面时的 CSS 色系回退 */
  tone: string;
};

export const STYLE_TEMPLATES: ManjuStyleTemplate[] = [
  {
    id: "realistic",
    label: "真人写实",
    prompt: "真人写实摄影，自然皮肤质感，真实光影，电影级细节",
    thumb: "/manju/styles/realism.webp",
    tone: "cinematic",
  },
  {
    id: "fantasy3d",
    label: "3D玄幻",
    prompt: "3D 玄幻国漫，精致角色建模，飘逸衣袂，灵气光效，东方奇幻氛围",
    thumb: "/manju/styles/3dcg-guoman.webp",
    tone: "xianxia",
  },
  {
    id: "costume",
    label: "真人古装",
    prompt: "真人古装写实，传统服饰纹理，古典建筑场景，自然光影与肤色质感",
    thumb: "/manju/styles/nannan-pencil.webp",
    tone: "guofeng",
  },
  {
    id: "render3d",
    label: "3D写实",
    prompt: "高质量 3D 写实渲染，次表面散射皮肤，电影灯光，虚幻引擎质感",
    thumb: "/manju/styles/disney-3d.webp",
    tone: "render3d",
  },
  {
    id: "anime2d",
    label: "2D动画",
    prompt: "2D 动画二次元，清晰线稿，鲜明色块，日系动漫光影",
    thumb: "/manju/styles/anime.webp",
    tone: "anime",
  },
  {
    id: "movie2d",
    label: "2D电影",
    prompt: "2D 电影感动画，细腻背景，柔和光晕，剧场版构图与氛围",
    thumb: "/manju/styles/shinkai.webp",
    tone: "anime",
  },
  {
    id: "hollywood",
    label: "好莱坞大片",
    prompt: "好莱坞大片质感，电影级调色，戏剧光影，宽银幕构图与镜头语言",
    thumb: "/manju/styles/cinematic-realism.webp",
    tone: "cinematic",
  },
  {
    id: "guoman3d",
    label: "3DCG国漫",
    prompt: "3DCG 国漫质感，精细建模，东方服饰与场景，电影灯光",
    thumb: "/manju/styles/3dcg-guoman.webp",
    tone: "xianxia",
  },
  {
    id: "cyberpunk",
    label: "赛博朋克",
    prompt: "赛博朋克霓虹，湿润街道反射，高对比冷暖光，未来都市",
    thumb: "/manju/styles/3d-cyberpunk.webp",
    tone: "cyberpunk",
  },
  {
    id: "celluloid",
    label: "赛璐璐",
    prompt: "赛璐璐动画质感，干净平涂色块，清晰轮廓线，经典动画光影",
    thumb: "/manju/styles/celluloid.webp",
    tone: "anime",
  },
  {
    id: "webtoon",
    label: "都市韩漫",
    prompt: "都市韩漫分镜感，清晰人物，干净背景，竖屏叙事插画",
    thumb: "/manju/styles/urban-manhwa.webp",
    tone: "webtoon",
  },
  {
    id: "ghibli",
    label: "宫崎骏",
    prompt: "宫崎骏动画风格，柔和手绘质感，自然风光，温暖色调与人文气息",
    thumb: "/manju/styles/ghibli.webp",
    tone: "anime",
  },
  {
    id: "shinkai",
    label: "新海诚",
    prompt: "新海诚风格，细腻光影与天空，写实背景，浪漫电影感构图",
    thumb: "/manju/styles/shinkai.webp",
    tone: "anime",
  },
  {
    id: "ink",
    label: "水墨",
    prompt: "水墨国风，留白意境，墨色层次，东方叙事插画感",
    thumb: "/manju/styles/ink-wash.webp",
    tone: "ink",
  },
  {
    id: "nannan-ink",
    label: "古风水墨",
    prompt: "古风水墨插画，淡墨渲染，古典人物与服饰，东方意境",
    thumb: "/manju/styles/nannan-ink.webp",
    tone: "ink",
  },
  {
    id: "nannan-pencil",
    label: "彩铅写实",
    prompt: "彩铅写实插画，细腻笔触，柔和阴影，手绘质感人物",
    thumb: "/manju/styles/nannan-pencil.webp",
    tone: "guofeng",
  },
  {
    id: "pixar",
    label: "皮克斯",
    prompt: "皮克斯 3D 动画，圆润造型，温暖灯光，电影级角色表演",
    thumb: "/manju/styles/pixar.webp",
    tone: "render3d",
  },
  {
    id: "disney3d",
    label: "迪士尼3D",
    prompt: "迪士尼 3D 动画质感，精致面部与毛发，梦幻光影，童话氛围",
    thumb: "/manju/styles/disney-3d.webp",
    tone: "render3d",
  },
  {
    id: "q3d",
    label: "Q版3D",
    prompt: "Q版 3D 角色，夸张头身比，可爱圆润建模，明亮色彩",
    thumb: "/manju/styles/q-3d.webp",
    tone: "render3d",
  },
  {
    id: "american-comic",
    label: "美漫",
    prompt: "美式漫画，粗犷墨线，网点与阴影，超级英雄分镜感",
    thumb: "/manju/styles/american-comic.webp",
    tone: "webtoon",
  },
  {
    id: "western-cartoon",
    label: "美式卡通",
    prompt: "美式卡通动画，夸张表情，鲜明色块，轻松喜剧节奏",
    thumb: "/manju/styles/western-cartoon.webp",
    tone: "anime",
  },
  {
    id: "flat-vector",
    label: "扁平矢量",
    prompt: "扁平矢量插画，几何色块，干净轮廓，现代平面设计感",
    thumb: "/manju/styles/flat-vector.webp",
    tone: "webtoon",
  },
  {
    id: "watercolor",
    label: "水彩",
    prompt: "水彩插画，湿润晕染，柔和笔触，通透色彩层次",
    thumb: "/manju/styles/watercolor.webp",
    tone: "ink",
  },
  {
    id: "pen-ink",
    label: "钢笔线条",
    prompt: "钢笔线条插画，精密线稿，交叉排线阴影，黑白速写感",
    thumb: "/manju/styles/pen-ink.webp",
    tone: "ink",
  },
  {
    id: "euro-ink",
    label: "欧式水墨",
    prompt: "欧式水墨插画，戏剧墨色，奇幻轮廓，欧洲绘本叙事感",
    thumb: "/manju/styles/euro-ink.webp",
    tone: "ink",
  },
  {
    id: "moebius",
    label: "莫比乌斯",
    prompt: "莫比乌斯科幻插画，精密线条，超现实景观，冷暖对比色",
    thumb: "/manju/styles/moebius.webp",
    tone: "cyberpunk",
  },
  {
    id: "pixel",
    label: "像素风",
    prompt: "像素艺术，清晰像素块，复古游戏色板，低分辨率美学",
    thumb: "/manju/styles/pixel.webp",
    tone: "webtoon",
  },
  {
    id: "bold-doodle",
    label: "重线条涂鸦",
    prompt: "重线条卡通涂鸦，粗黑描边，活泼色块，手绘随性感",
    thumb: "/manju/styles/bold-doodle.webp",
    tone: "anime",
  },
  {
    id: "q-cute",
    label: "Q萌卡通",
    prompt: "Q萌卡通，大头比例，柔和配色，可爱表情与简化形体",
    thumb: "/manju/styles/q-cute-cartoon.webp",
    tone: "anime",
  },
  {
    id: "q-line",
    label: "Q萌线稿",
    prompt: "Q萌线稿卡通，干净细线，淡彩填充，轻快插画感",
    thumb: "/manju/styles/q-line-cartoon.webp",
    tone: "anime",
  },
  {
    id: "q-hand",
    label: "Q版手绘",
    prompt: "Q版手绘插画，柔软笔触，温暖色调，亲切角色设计",
    thumb: "/manju/styles/q-hand-drawn.webp",
    tone: "anime",
  },
  {
    id: "q-fluffy",
    label: "Q版粘毛",
    prompt: "Q版粘毛质感，蓬松毛发，软萌造型，触觉感强的 3D 渲染",
    thumb: "/manju/styles/q-fluffy.webp",
    tone: "render3d",
  },
  {
    id: "clay",
    label: "黏土",
    prompt: "黏土定格动画质感，手作纹理，柔和阴影，玩具感角色",
    thumb: "/manju/styles/clay.webp",
    tone: "render3d",
  },
  {
    id: "felt",
    label: "羊毛毡",
    prompt: "羊毛毡手工质感，纤维纹理，柔和造型，温暖手工氛围",
    thumb: "/manju/styles/felt.webp",
    tone: "render3d",
  },
  {
    id: "shadow-puppet",
    label: "皮影风",
    prompt: "皮影戏风格，侧面剪影，镂空纹样，暖色灯光与东方戏剧感",
    thumb: "/manju/styles/shadow-puppet.webp",
    tone: "guofeng",
  },
  {
    id: "horror",
    label: "恐怖悬疑",
    prompt: "恐怖悬疑氛围，冷调光影，压迫构图，不安细节与戏剧阴影",
    thumb: "/manju/styles/horror-suspense.webp",
    tone: "cinematic",
  },
  {
    id: "mystery-horror",
    label: "悬疑恐怖",
    prompt: "悬疑恐怖叙事，低饱和色调，隐匿威胁感，电影级暗部层次",
    thumb: "/manju/styles/mystery-horror.webp",
    tone: "cinematic",
  },
  {
    id: "nannan-horror",
    label: "中式恐怖",
    prompt: "中式恐怖插画，民俗符号，阴冷色调，东方志怪氛围",
    thumb: "/manju/styles/nannan-horror.webp",
    tone: "guofeng",
  },
  {
    id: "meme",
    label: "沙雕动画",
    prompt: "沙雕动画风格，夸张表情，简单造型，搞笑分镜节奏",
    thumb: "/manju/styles/meme-animation.webp",
    tone: "anime",
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
