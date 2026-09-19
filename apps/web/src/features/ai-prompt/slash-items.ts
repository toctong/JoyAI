export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  insert?: string;
  kind?: "image" | "video" | "text";
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "image",
    label: "/图片",
    description: "切换到图片生成",
    kind: "image",
  },
  {
    id: "video",
    label: "/视频",
    description: "切换到视频生成",
    kind: "video",
  },
  {
    id: "text",
    label: "/文本",
    description: "切换到文本 / LLM",
    kind: "text",
  },
  {
    id: "cinematic",
    label: "/电影感",
    description: "电影光影与胶片质感",
    insert: "电影感光影，浅景深，胶片质感，",
  },
  {
    id: "storyboard",
    label: "/创作分镜",
    description: "分镜叙事提示",
    insert: "分镜叙事，镜头推进，场景衔接自然，",
  },
  {
    id: "portrait",
    label: "/人像",
    description: "人像摄影提示词",
    insert: "人像特写，柔光，清晰五官，自然皮肤纹理，",
  },
  {
    id: "anime",
    label: "/动漫",
    description: "二次元插画风格",
    insert: "日系二次元插画，精致线稿，高饱和色彩，",
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.id.includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.description.includes(q),
  );
}
