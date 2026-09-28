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

前端：

- 剧本帮写：`apps/web/src/features/manju/script-ai/`（Studio 右栏 Tab「剧本帮写」）
- 漫剧 Agent：`apps/web/src/features/manju/agent/`（JSON actions，scope `manju-agent`）

会话：`project_chat` — `manju-script`（帮写）与 `manju-agent`（Agent）分开；不写进漫剧草稿。

面板可切换技能：默认 `script_write`（JSON 帮写可应用）；小洛文本技能走 advisor 自由文本。图像类小洛技能尚未挂 UI。

禁止从 ai-video / ArcReel / 外部 short-drama 仓库整段粘贴 SKILL 或 references。
