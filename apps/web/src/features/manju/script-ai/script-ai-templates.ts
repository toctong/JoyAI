/**
 * 面板侧 re-export：题材与示例定义在 `@joyai/shared`，
 * 技能说明在 `apps/server/.../skills/script-write/`。
 */
export {
  SCRIPT_WRITE_GENRES as SCRIPT_AI_TYPES,
  SCRIPT_WRITE_STARTERS as SCRIPT_AI_TEMPLATES,
  type ScriptWriteGenre as ScriptAiType,
  type ScriptWriteStarter,
} from "@joyai/shared";

/** 兼容旧字段名：title / category / desc */
import {
  SCRIPT_WRITE_STARTERS,
  type ScriptWriteGenre,
  type ScriptWriteStarter,
} from "@joyai/shared";

export type ScriptAiTemplate = {
  title: string;
  category: ScriptWriteGenre;
  desc: string;
};

export const SCRIPT_AI_PANEL_TEMPLATES: ScriptAiTemplate[] =
  SCRIPT_WRITE_STARTERS.map((s: ScriptWriteStarter) => ({
    title: s.title,
    category: s.genre,
    desc: s.prompt,
  }));
