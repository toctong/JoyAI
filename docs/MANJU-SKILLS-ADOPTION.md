# 漫剧 Skills 改造清单（借鉴 drama-skills）

参考：[zenstory-ai/drama-skills](https://github.com/zenstory-ai/drama-skills)（MIT）。  
约束：只借鉴阶段职责与写作/连续性规则；**禁止整段粘贴**上游 `SKILL.md` / references；真源仍是 `ManjuDraft` JSON + BullMQ，不是五份 Markdown 工作区。

产品漏斗（已定）：**初始设定 → 剧本(+AI帮写) → 解析剧本 → 资产生图 → 剧集「制作视频」新开 tab → 分镜/提示词/视频**。

---

## 1. Purpose 对照

| 优先级 | drama-skills | 我们 purpose / 入口 | 现状 | 改造目标 |
|:---:|---|---|---|---|
| P0 | `short-drama-write` | `script_write` + 剧本页 | 有帮写 JSON（script/hook/tags） | 吸收：单集承诺、因果节拍、可拍对白、生产标签语义（映射到 `visual`/`dialogue`/`utterances`，不落盘 md） |
| P0 | `short-drama-assets` | `analyze_assets` | 有角色/场景/道具 + tags/overview/episodes | 吸收：身份 vs 变体、识别锚点、连续性锁短语；解析后资产生图仍走现有 job |
| P0 | `short-drama-storyboard` | `script_plan` + 制作台 | 有镜头 visual/dialogue/assetNames；制作台已有景别/角度/运镜字段 | 吸收：唯一职责、起止状态、对白估时写进镜长建议；冻结关键帧 → `imagePrompt` 草稿 |
| P1 | `short-drama-image-prompts` | 资产生图面板 + 部分 `author_prompts` | 资产参考图已有；缺「参考板提示词」专用 skill | 可选新 purpose `asset_board_prompts`，或并入资产详情 AI 生图前置文案 |
| P1 | `short-drama-video-prompts` | `author_prompts` 的 video 侧 | 有 videoPrompt | 吸收：起点→动作→终点、口型/说话人绑定、`@[登记名]` 规则加强 |
| P1 | `short-drama-produce` | image / video jobs | 已有确认脚本门禁 | 强化「预览提示词 → 用户确认 → 提交」；不引入外部 adapter 文件树 |
| P2 | `short-drama-novel-analyze` | 无 | — | 新 purpose `novel_analyze`：长文抽样/分集候选，结果写入 overview/tags/episodes 草案 |
| P2 | `short-drama-develop` | 弱（`plan_episodes` / `series_memory`） | 有切集与连载记忆 | 合并进 develop 或增强 `plan_episodes`：分集地图 + 钩子手册 |
| P2 | `short-drama-review` | workflow / 脚本门 | 弱 | 新 purpose `manju_review`：结构/连续性检查清单，只出报告不改稿 |
| P3 | `short-drama-edit` | 预览 / 剪映导出 | 有连播、ZIP、剪映包 | 远期：剪辑单字段；不做 FFmpeg 成片替代品除非单独立项 |
| — | `short-drama` 总控 | `getWorkflowNextAction` + 侧栏 | 已有漏斗文案 | 产品内下一阶段引导即可，**不**引入 Claude Code dashboard |

编排原则：

- **产品掌控阶段门禁**；skill 只提供 system/prompt 与 JSON schema。
- 输出一律 zod 校验后 `apply*Result` 回写 draft。
- 生图/生视频永远走 `@joyai/ai-providers` + BullMQ，skill 不直连供应商。

---

## 2. 落地顺序（建议迭代）

### Sprint A — Write（`script_write`）

- [x] 在 `apps/server/src/modules/jobs/skills/script-write/` 增补 **自写** 约束摘录（单集承诺、场须有变化、对白可演、勿堆模板句）；不复制上游全文。
- [x] `SCRIPT_WRITE_SYSTEM`：明确可输出 `hook`/`tags`；正文禁止把钩子说明写进 `script`。
- [x] 前端帮写面板：应用后仍只写 `scriptText` + tags；hook 进分集字段（已有则核对）。
- [ ] 验收：帮写一集都市短剧，tags≥2，正文可被 `analyze_assets` 抽出角色。

### Sprint B — Assets（`analyze_assets`）

- [x] 升级 `ANALYZE_ASSETS_SYSTEM`：`description` 要求「识别锚点」可见事实；角色可带 `aliases`；可选 `continuityLock`（短短语，先存 `description` 或 `detail` 扩展字段）。
- [x] schema：若加 `continuityLock`，先 optional，normalize 兼容旧稿。
- [x] 清空重解析：继续清 assets + tags/overview（已做）；文档标明「剧集视频保留」。

> **`clear_reparse` 范围**：清空 `draft.assets`、`tags`、`overview`，并清理镜头上指向已删资产的 `assetRefs`。  
> **保留**：分集列表、分集 `sourceText`/钩子、镜头与已生成的剧集分镜图/视频（不因重解析删除）。

- [ ] 验收：解析后题材标签、梗概、第1集、角色场景道具均回写；前端轮询 `lastAnalyzeJobId` 成功刷新。

### Sprint C — Storyboard（`script_plan` + 制作台）

- [x] `SCRIPT_PLAN_SYSTEM`：每镜唯一职责；`visual` 写清起点→动作→终点；沿用全局 `#index`。
- [x] 输出可选填 `shotSize` / `cameraAngle` / `cameraMove` / `title`（与 draft 字段对齐）。
- [x] 制作台「开始生成」：无分镜时提供「AI 规划本集分镜」按钮 → `script_plan`（`manjuEpisodeId`）。
- [ ] 验收：制作视频新开 tab；规划后左栏分镜表有镜头；景别等可编辑并参与生图 prompt。

### Sprint D — Prompts（`author_prompts`）

- [x] 拆清 system：imagePrompt = 冻结关键帧；videoPrompt = 运动/表演/运镜；禁止改对白与镜序。
- [x] 加强 `@[登记名]` / 衍生 `@[本体/衍生]` 与参考图槽位说明（与 `prompt-builders.ts` 一致）。
- [x] UI：制作台「生成提示词」可单镜或本集批量，仍受 `scriptConfirmed` 门禁（或制作台内显式确认）。
- [ ] 验收：提示词回写后生图/生视频任务可提交且带正确 refs。

### Sprint E — Produce 体验（无新 purpose）

- [x] 统一「预览将花费 / 确认提交」文案（制作台 + 资产详情）。
- [x] Job 失败 toast 带 purpose 中文名；解析中状态不卡死（`lastAnalyzeJobId` 轮询已接）。

### Sprint F — 可选扩展

- [x] `novel_analyze`：长文 → overview/tags/episode 草案。
- [x] `manju_review`：只读检查（资产未出图、镜无资产、对白过长等）→ 结构化报告。
- [x] `plan_episodes` / `series_memory` 与 develop 职责合并说明，避免侧栏再推「连载记忆」打断主漏斗。

> **Develop 说明（已定）**：主漏斗不主动推 `series_memory` / `plan_episodes`。`getWorkflowNextAction` 只引导设定 → 剧本 → 解析 → 资产生图 → 制作视频。分集切分与连载记忆保留为 Agent / 高级入口，不打断「制作视频」主路径。  
> **入口**：概览 / 剧本页「长文拆集」「制作检查」；Agent `run_skill` 也可触发。检查报告写入 `draft.lastReview`，不改资产与镜头。

---

## 3. 明确不做

| 项 | 原因 |
|----|------|
| 用五份 `.md` 替换 `ManjuDraft` | 与 Studio/DB/协作模型冲突 |
| 整仓引入 drama-skills 运行时 / Python dashboard | 运行时不同；违反「拿来主义」红线 |
| Skill 内直接调 Seedance/第三方 URL | 必须走渠道与 jobs |
| 默认打开 Claude Agent 全自动连跑花钱生产 | 产品要「确认后再生成」 |

---

## 4. 文件锚点（改哪里）

| 层 | 路径 |
|----|------|
| System 提示词 | `apps/server/src/modules/jobs/llm-prompts.ts` |
| Skill 说明（自维护） | `apps/server/src/modules/jobs/skills/**` |
| 内置 skill 种子 | `apps/server/src/modules/skills/skills.service.ts` |
| 回写 | `apps/server/src/modules/manju/manju.service.ts` |
| Schema | `packages/shared` → `ManjuAnalyzeResult` / Draft shot 字段 |
| 拼装提示词 | `apps/web/.../lib/prompt-builders.ts` |
| 漏斗文案 | `getWorkflowNextAction`（`manju-types.ts`） |
| 制作台 | `episode-produce-workspace.tsx` |
| 工程规范 | `.cursor/skills/joyai-engineering`、`.cursor/skills/manju-script-write` |

---

## 5. 验收总表（主路径）

1. 新建 → 初始设定 → 剧本（可帮写）→ 解析（含 tags/梗概/资产/第1集）  
2. 角色/场景/道具单张或批量出图  
3. 剧集管理点「制作视频」→ **新标签** `/manju/:id/episodes/:epId`  
4. 规划分镜 → 写提示词 → 生图 → 生视频 → 预览  

任一步 AI 失败须有明确 toast；成功须 `loadProject` 后 UI 可见新字段。
