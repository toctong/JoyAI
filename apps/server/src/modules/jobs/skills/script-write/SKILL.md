---
name: manju-script-write
description: >-
  JoyAI 漫剧「AI 帮写」技能：对话生成/润色剧本，经 BullMQ purpose=script_write。
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
| 正文整理 | `apps/web/src/features/manju/lib/sanitize-script-text.ts`（钩子迁出正文） |
| Job purpose | `script_write`（结果不自动回写草稿，用户点「应用修改」；JSON 含可选 `hook`） |

## 行为

1. 用户在剧本步左侧对话 → `POST /jobs` `{ kind: llm, purpose: script_write }`
2. Worker 用 `SCRIPT_WRITE_SYSTEM`，解析 JSON `{ intent, reply, script }`
3. Socket `job:completed` 带 `result.scriptWrite`；前端展示并可应用到 `scriptText`

## 题材

空状态卡片与类型下拉来自 `SCRIPT_WRITE_GENRES` / `SCRIPT_WRITE_STARTERS`（shared）。
题材灵感参考开源短剧方法论（如 [0xsline/short-drama](https://github.com/0xsline/short-drama) MIT），**已重写**，禁止整文件粘贴上游 SKILL/references。

## 改提示词时

- 改契约或编剧规则 → 只动 `system.ts`，保持 JSON 三字段稳定
- 改卡片文案 → 只动 `script-write-genres.ts`，重建 `@joyai/shared`
- 不要把大段 reference markdown 塞进 system（控制 token）
