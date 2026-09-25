---
name: manju-script-write
description: >-
  FrameRally manju AI script chat (script_write). Read when changing script AI panel,
  genre starters, or script_write system prompts.
---

# 漫剧 AI 帮写

运行时技能与提示词在仓库内：

- 说明与约束：`apps/server/src/modules/jobs/skills/script-write/SKILL.md`
- System：`apps/server/src/modules/jobs/skills/script-write/system.ts`
- 题材/示例：`packages/shared/src/manju/script-write-genres.ts`

前端：`apps/web/src/features/manju/script-ai/`。会话按项目存在服务端 `project_chat`（`manju-script`），不写进漫剧草稿，也不放浏览器。

面板可切换技能：默认 `script_write`（JSON 帮写可应用）；小洛文本技能（`film_script_analysis` 等）走 advisor 自由文本回复。图像类小洛技能尚未挂 UI。

禁止从 ai-video / 外部 short-drama 仓库整段粘贴 SKILL 或 references。
