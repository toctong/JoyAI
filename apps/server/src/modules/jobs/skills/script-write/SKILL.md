---
name: manju-script-write
description: >-
  FrameRally 漫剧「AI 帮写」技能：对话生成/润色剧本，经 BullMQ purpose=script_write。
  Use when editing manju script AI chat, script_write prompts, or genre starters.
---

# 漫剧 AI 帮写（script_write）

## 位置

| 内容 | 路径 |
|------|------|
| 运行时 system 提示词 | `apps/server/src/modules/jobs/skills/script-write/system.ts` |
| 题材 + 空状态示例 | `packages/shared/src/manju/script-write-genres.ts` |
| LLM 入口 re-export | `apps/server/src/modules/jobs/llm-prompts.ts` → `SCRIPT_WRITE_SYSTEM` |
| 前端面板 | `apps/web/src/features/manju/script-ai/` |
| 会话存储 | 服务端 `project_chat`（scope=`manju-script`），不进漫剧草稿 |
| 正文整理 | `apps/web/src/features/manju/lib/sanitize-script-text.ts`（钩子迁出正文） |
| Job purpose | `script_write`（结果不自动回写草稿，用户点「应用」；JSON 含 `hook`、`tags`） |
| 改造清单 | `docs/MANJU-SKILLS-ADOPTION.md` Sprint A |

## 行为

1. 用户在剧本步左侧对话 → `POST /jobs` `{ kind: llm, purpose: script_write }`
2. Worker 用 `SCRIPT_WRITE_SYSTEM`，解析 JSON `{ intent, reply, script, hook, tags, summary? }`
3. Socket `job:completed` 带 `result.scriptWrite`；前端展示并可应用：
   - 普通帮写：`script` → `scriptText`；`tags` → `draft.tags`；`hook` → 第 1 集
   - **续写下一集**（用户消息含【续写下一集】）：应用时新建分集，写入 `sourceText` / `hook` / `summary`，不覆盖全剧正文

## 自维护创作约束（摘录）

改 `system.ts` 时保持这些产品意图（方法论可参考开源短剧 skill，**禁止整段粘贴**）：

1. **本集承诺**：开篇接住进入状态；中段因果推进；结尾兑现或有意延迟（钩子进 `hook`）
2. **场须有变**：每场改变信息/权力/关系/情绪/风险/物理局面之一
3. **对白可演**：争取或试探关系；能演的不说；短句、性格分明
4. **体量**：默认 3～5 场、600～1200 字，除非用户另定
5. **tags**：create/revise 必须 2～5 个；只写在 JSON，不进正文
6. **hook**：只写在 JSON；正文禁「本集钩子：」类元标注
7. **续写**：开篇承接上一集钩子；只写目标集；新 hook 留给再下一集

## 题材

空状态卡片与类型下拉来自 `SCRIPT_WRITE_GENRES` / `SCRIPT_WRITE_STARTERS`（shared）。

## 改提示词时

- 改契约或编剧规则 → 只动 `system.ts`
- 改卡片文案 → 只动 `script-write-genres.ts`，重建 `@joyai/shared`
- 不要把大段 reference markdown 塞进 system（控制 token）
- 续写 UI：`apps/web/.../studio/episode-continue-dialog.tsx` + `lib/continue-episode.ts`
