/**
 * 漫剧 AI 帮写：题材与空状态示例。
 * 题材列表参考开源短剧方法论（如 0xsline/short-drama MIT）重写，非原文粘贴。
 */

export const SCRIPT_WRITE_GENRES = [
  "都市情感",
  "霸道总裁",
  "甜宠",
  "重生穿越",
  "战神归来",
  "古装宫廷",
  "成语故事",
  "寓言",
  "励志逆袭",
  "家庭伦理",
  "萌宝",
  "悬疑探案",
  "软科幻",
  "末日重生",
  "喜剧",
  "漫剧",
  "TVC 广告",
  "文旅宣传",
  "其他",
] as const;

export type ScriptWriteGenre = (typeof SCRIPT_WRITE_GENRES)[number];

export type ScriptWriteStarter = {
  id: string;
  title: string;
  genre: ScriptWriteGenre;
  /** 点卡片后填入输入框的示例需求 */
  prompt: string;
};

/** 空状态展示用的高质量开场示例（可点填） */
export const SCRIPT_WRITE_STARTERS: ScriptWriteStarter[] = [
  {
    id: "ceo-sweet",
    title: "冷面总裁初遇",
    genre: "霸道总裁",
    prompt:
      "写一集短剧开篇（约 600–900 字）：冷面集团总裁雨夜撞见独立经营甜品店的女主，身份反差、不卑不亢。含场景头、镜头提示与对白，结尾留钩子。",
  },
  {
    id: "urban-miss",
    title: "都市错过重逢",
    genre: "都市情感",
    prompt:
      "写短剧开篇：五年前错过的恋人在地铁口重逢，雨夜、旧伞、未说完的话。三角张力点到为止，结尾情绪钩，含场景与对白。",
  },
  {
    id: "rebirth-office",
    title: "重生打脸职场",
    genre: "重生穿越",
    prompt:
      "写第 1 集：女主重生回到被开除前一天，先知先觉拆穿同事陷害。金手指写清，前 30 秒入戏，结尾信息钩，国内短剧格式。",
  },
  {
    id: "palace-scheme",
    title: "宫斗反杀",
    genre: "古装宫廷",
    prompt:
      "写一集古装漫剧感剧本：冷宫边缘妃子识破贵妃毒计。智商在线、计谋有步骤，突出画面与对白，结尾危机钩。",
  },
  {
    id: "idiom-stump",
    title: "成语·守株待兔",
    genre: "成语故事",
    prompt:
      "写成语故事短剧开篇「守株待兔」：宋国农夫锄地时野兔撞树而死，他惊喜决定弃耕守桩。文言白话、真人古装感，约 3 场，结尾留执念钩子。",
  },
  {
    id: "fable-fox",
    title: "寓言·狐狸与葡萄",
    genre: "寓言",
    prompt:
      "写寓言短片第 1 集：狐狸够不到葡萄后自我安慰。画面感强、对白短，点题克制，结尾留人物关系钩。",
  },
  {
    id: "war-god-return",
    title: "战神归乡受辱",
    genre: "战神归来",
    prompt:
      "写男频短剧开篇：隐姓埋名的战神回乡遭亲戚羞辱，蓄力受辱后不立刻爆发，留身份揭露伏笔。含场景、对白与结尾钩子。",
  },
  {
    id: "mystery-clue",
    title: "悬疑第一线索",
    genre: "悬疑探案",
    prompt:
      "写短剧第 1 集：雨夜旧宅发现失踪案关键物证，引入两个嫌疑人。每场推进线索，结尾反转钩，格式含场景与镜头。",
  },
  {
    id: "tvc-watch",
    title: "品牌 15 秒",
    genre: "TVC 广告",
    prompt:
      "为一款智能手表写 15 秒 TVC 脚本：痛点→产品展示→收束 slogan，三段镜头，可拍、可分镜。",
  },
  {
    id: "city-night",
    title: "城市夜游",
    genre: "文旅宣传",
    prompt:
      "用第一人称旁白写 2 分钟城市夜游短片脚本：江边灯光与小巷烟火，温暖克制，分场景可拍。",
  },
];
