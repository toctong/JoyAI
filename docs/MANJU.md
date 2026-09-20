# 漫剧 — 规格与现状

漫剧是独立的结构化项目：剧本、资产、分镜、镜头视频都在 `/manju` 里完成。实现约束见 `.cursor/skills/joyai-engineering/SKILL.md` 与 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 参考谁

| 来源 | 只借鉴 | 不借鉴 |
|------|--------|--------|
| [ArcReel](https://github.com/ArcReel/ArcReel) drama | 阶段顺序、资产一致性、分集、确认后再写提示词、按名称/镜号非破坏合并 | AGPL 代码、Agent SDK、ComfyUI、剪映草稿、旁白 TTS |
| [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app) | 双向画布对接时可再对照 | 不要把 Vue Flow 工作台搬进漫剧 |

只读流程与数据结构，用本仓栈重写。禁止整页/整模块/提示词原文粘贴。

## 2. 产品形态

### 2.1 闭环与边界

- **创作 `/studio`**：单次生图/生视频，与漫剧无关。
- **漫剧 `/manju`**：一份 `ManjuDraft`；六步可来回，有门禁。
- **画布**：允许**单向**「推送镜头到新画布项目」（只带 `assetId`/`url`，不写回漫剧草稿）。不做双向同步，草稿内不预埋 `canvasProjectId`，节点 `data` 不塞 `manjuShotId`。

### 2.2 配置三层

1. 渠道默认（管理后台 `llm` / `image` / `video`）
2. `draft.settings`：画幅、风格/`styleId`、时长、`mode`、`gridLayout`；文本/图像/视频渠道模型为**项目全局**（工作台头部固定选择，非仅视频设定）
3. 单镜：`shot.duration`、`assetRefs`

`settings.mode`：

| 模式 | 行为 | 状态 |
|------|------|------|
| `i2v` | 首帧上一镜分镜图，末帧本镜 | 默认 |
| `ref` | 只挂该镜资产图 | 已接 |
| `grid` | 宫格整图 → 客户端切块 → 逐格视频 | 已接（2×2 / 3×3） |

首次提交视频后锁定 `mode`。

### 2.3 合并规则

- 资产按 `kind + name`；衍生用 `parentId`，提及 `@[本体/衍生]`
- 分集按 `title`；分镜按全局 `index`；保留媒体与 id
- `author_prompts` 只按 `#index` 写提示词

### 2.4 技能（非 Agent）

| purpose | 作用 |
|---------|------|
| `script_write` | AI 帮写对话：生成/润色剧本，不自动回写（用户点「应用」）。技能见 `apps/server/src/modules/jobs/skills/script-write/`，题材示例在 `@joyai/shared` |
| `analyze_assets` | 梗概、角色/场景/道具、分集标题 |
| `plan_episodes` | 分集 + 原文切片 `sourceText` |
| `series_memory` | 世界观 / 小传 / 伏笔 |
| `script_plan` | 镜头画面、对白、资产名、分集 |
| `author_prompts` | 按镜号写画面/视频提示词 |

运行时拼装在 `prompt-builders.ts`（`@[名]` → `图N`）。

## 3. 已交付能力（相对批次 A–D 的现状）

六步：剧本（文件导入 txt/md/docx）→ 视频设定（风格模板 + RHF）→ 资产（衍生、素材库引用、上传）→ 分镜脚本（Command 挂资产、宫格批量出图）→ 分镜视频 → 预览（连播、ZIP、浏览器 mediabunny 成片、推送到画布）。

门禁：无参考图不能进分镜；未确认脚本不能进视频；批量 i2v/成片缺媒体会跳过或提示。

明确仍不做：配音 TTS、字幕烧录、剪映草稿、服务端 FFmpeg、Agent 多轮、ComfyUI、上一镜视频末帧抽帧、双向画布同步。

## 4. 依赖

| 已用 | 用途 |
|------|------|
| `@uiw/react-md-editor`、`@dnd-kit/*`、`plyr`、`react-photo-view`、`zustand`、`zod`、`socket.io-client` | 编辑 / 排序 / 播放 / 状态 |
| `react-dropzone`、`mammoth` | 参考图上传、docx 导入 |
| `react-hook-form`、`jszip`、`cmdk` + shadcn command/popover | 设定表单、ZIP、资产搜索 |
| `mediabunny` | 预览成片拼接（统一分辨率后编码） |
| `react-resizable-panels`、`@tiptap/*` | 预览分栏、提示词 `@` |

不要为漫剧再引 ffmpeg.wasm、剪映库、第二套 Markdown、xyflow。

## 5. 验收

- 未指定模型时技能与生图/生视频走渠道默认
- 连跑分析/规划不丢已有 id 与媒体
- 确认脚本后改对白会取消确认并挡提示词技能
- 成片至少两镜；ZIP 与成片文案区分
- 「推送到画布」只创建新画布项目，漫剧草稿无 `canvasProjectId`
