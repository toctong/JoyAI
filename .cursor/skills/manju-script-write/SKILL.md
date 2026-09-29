---
name: manju-script-write
description: >-
  FrameRally manju AI script chat (script_write). Read when changing script AI panel,
  genre starters, script_write system prompts, or continue-next-episode flow.
---

# 漫剧 AI 帮写

运行时技能与提示词在仓库内：

- 说明与约束：`apps/server/src/modules/jobs/skills/script-write/SKILL.md`
- System：`apps/server/src/modules/jobs/skills/script-write/system.ts`
- 题材/示例：`packages/shared/src/manju/script-write-genres.ts`
- 改造清单：`docs/MANJU-SKILLS-ADOPTION.md`（Sprint A）

前端：

- 剧本帮写：`apps/web/src/features/manju/script-ai/`
- 漫剧 Agent：`apps/web/src/features/manju/agent/`（JSON actions，scope `manju-agent`）
- 应用回写：`script-step.tsx` → `scriptText` + `tags`；`hook` → 第 1 集；`sanitize-script-text.ts` 剥离正文钩子行
- **续写下一集**：`studio/episode-continue-dialog.tsx` + `lib/continue-episode.ts`；剧集卡 / 详情 / 制作台「续写下集」；应用时新建分集，不覆盖全剧正文

会话：`project_chat` — `manju-script`（帮写）与 `manju-agent`（Agent）分开；续写弹层本地命名空间 `script-ai-continue`。

面板可切换技能：默认 `script_write`（JSON 帮写可应用）；小洛文本技能走 advisor 自由文本。

改 `system.ts` 时保持：本集承诺、场须有变、对白可演、tags 2～5、hook 只进 JSON；含【续写下一集】时按 create 写目标集。

禁止从 ai-video / ArcReel / 外部 short-drama 仓库整段粘贴 SKILL 或 references。
