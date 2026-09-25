/**
 * Script-AI selectable skills (wired to admin builtin catalog purposes).
 * Default is FrameRally `script_write` (JSON create/revise).
 * Xiaoluo text skills return free-form advisor replies.
 */
export type ScriptAiSkillId =
  | "script_write"
  | "film_script_analysis"
  | "film_screenwriting"
  | "original_screenplay_adaptation"
  | "video_shot_analysis"
  | "script_assets_dna"
  | "script_to_video"
  | "script_to_video_90s";

export type ScriptAiSkillOption = {
  id: ScriptAiSkillId;
  label: string;
  hint: string;
  /** LLM job purpose — must match SkillsService catalog */
  purpose: ScriptAiSkillId;
  /** Expect ManjuScriptWrite JSON vs free-form advisor text */
  mode: "script_write" | "advisor";
};

export const SCRIPT_AI_SKILLS: ScriptAiSkillOption[] = [
  {
    id: "script_write",
    label: "AI 帮写",
    hint: "生成 / 润色剧本，可一键应用",
    purpose: "script_write",
    mode: "script_write",
  },
  {
    id: "film_script_analysis",
    label: "剧本分析",
    hint: "结构、人物、对白深度审计",
    purpose: "film_script_analysis",
    mode: "advisor",
  },
  {
    id: "film_screenwriting",
    label: "编剧创作",
    hint: "创意 → 大纲 → 正文开发",
    purpose: "film_screenwriting",
    mode: "advisor",
  },
  {
    id: "original_screenplay_adaptation",
    label: "原创改编",
    hint: "深层重构，降低同质化",
    purpose: "original_screenplay_adaptation",
    mode: "advisor",
  },
  {
    id: "video_shot_analysis",
    label: "视频拉片",
    hint: "逐镜拆解镜头语言",
    purpose: "video_shot_analysis",
    mode: "advisor",
  },
  {
    id: "script_assets_dna",
    label: "资产 DNA",
    hint: "角色 / 场景 / 道具视觉指令",
    purpose: "script_assets_dna",
    mode: "advisor",
  },
  {
    id: "script_to_video",
    label: "分镜脚本",
    hint: "剧本 → 分段视频分镜",
    purpose: "script_to_video",
    mode: "advisor",
  },
  {
    id: "script_to_video_90s",
    label: "90s 分镜",
    hint: "单集 0–90s 连续分镜",
    purpose: "script_to_video_90s",
    mode: "advisor",
  },
];

export function scriptAiSkillById(id: string): ScriptAiSkillOption {
  return (
    SCRIPT_AI_SKILLS.find((s) => s.id === id) ?? SCRIPT_AI_SKILLS[0]!
  );
}
