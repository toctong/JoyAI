# 漫剧 — 规格与现状

漫剧是独立的结构化项目：剧本、资产、分镜、镜头视频都在 `/manju` 里完成。实现约束见 `.cursor/skills/joyai-engineering/SKILL.md` 与 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 参考谁

| 来源 | 只借鉴 | 不借鉴 |
|------|--------|--------|
| [ArcReel](https://github.com/ArcReel/ArcReel) drama | 三栏 Studio IA、阶段顺序、资产一致性、分集、确认后再写提示词、按名称/镜号非破坏合并 | AGPL 源码、Claude Agent SDK / MCP、ComfyUI、旁白 TTS |
| [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app) | 双向画布对接时可再对照 | 不要把 Vue Flow 工作台搬进漫剧 |

只读流程与数据结构，用本仓栈重写。禁止整页/整模块/提示词原文粘贴。

## 2. 产品形态

### 2.1 工作台（Studio 三栏）

路由在 `/manju/[id]/…`：

| 路径 | 舞台 |
|------|------|
| `/manju/[id]` | 项目概览（快照 / 宫格预览） |
| `/manju/[id]/source` | 剧本正文 |
| `/manju/[id]/characters` · `/scenes` · `/props` | 设定库 |
| `/manju/[id]/settings` | 视频设定 |
| `/manju/[id]/episodes/[epId]` | 分镜主舞台（镜头详情 / 卡片 / 提示词 / 视频） |
| `/manju/[id]/preview` | 预览与导出 |

壳：顶栏阶段条 + 左资产/分集侧栏 + 中主舞台 + 右 Agent（可拖宽度）。旧 `?step=` / `?panel=` 会重定向到上述路径。

### 2.2 闭环与边界

- **创作 `/studio`**：单次生图/生视频，与漫剧无关。
- **漫剧 `/manju`**：一份 `ManjuDraft`；阶段门禁改由 `scriptReview` / `scriptConfirmed` + workflow summary 驱动。
- **画布**：允许**单向**「推送镜头到新画布项目」（只带 `assetId`/`url`，不写回漫剧草稿）。不做双向同步。

### 2.3 配置三层

1. 渠道默认（管理后台 `llm` / `image` / `video`）
2. `draft.settings`：画幅、风格/`styleId`、时长、`mode`、`gridLayout`；文本/图像/视频渠道模型为**项目全局**
3. 单镜：`shot.duration`、`assetRefs`、可选 `endFrameAssetId`（手动尾帧）

`settings.mode`：`i2v` | `ref` | `grid`（2×2 / 3×3）。首次提交视频后锁定 `mode`。

### 2.4 合并规则

- 资产按 `kind + name`；衍生用 `parentId`，提及 `@[本体/衍生]`
- 分集按 `title`；分镜按全局 `index`；保留媒体与 id
- `author_prompts` 只按 `#index` 写提示词

### 2.5 技能与 Agent

| purpose | 作用 |
|---------|------|
| `script_write` | AI 帮写对话（用户点「应用」） |
| `analyze_assets` | 梗概、角色/场景/道具、分集标题 |
| `plan_episodes` | 分集 + 原文切片 |
| `series_memory` | 世界观 / 小传 / 伏笔 |
| `script_plan` | 镜头画面、对白、资产名 |
| `author_prompts` | 按镜号写画面/视频提示词 |

- **Agent**：右侧面板 Tab「Agent」；JSON actions + `project_chat` scope `manju-agent`（对齐画布 Agent，非 Claude SDK）。「剧本帮写」Tab 仍用 `manju-script`。
- **剪映**：`GET /manju/projects/:id/export/jianying` 打包 zip（`draft_content.json` + `media/`），非 pyjianyingdraft 照搬。
- **脚本审核门**：`script-review` get/save/confirm；未确认不可批量写提示词 / 出视频。

## 3. 已交付能力

三栏 Studio 闭环：创建向导（模式）→ 剧本 → 设定库 → 确认脚本 → 分镜/提示词/视频 → 预览（连播、ZIP、mediabunny、推画布）→ 导出 JSON / 剪映包。概览支持草稿快照与宫格预览。

明确仍不做：配音 TTS / 字幕烧录、服务端 FFmpeg 成片拼接、ComfyUI、上一镜视频末帧抽帧、双向画布同步。

## 4. 依赖

| 已用 | 用途 |
|------|------|
| `@uiw/react-md-editor`、`@dnd-kit/*`、`plyr`、`react-photo-view`、`zustand`、`zod`、`socket.io-client` | 编辑 / 排序 / 播放 / 状态 |
| `react-dropzone`、`mammoth` | 参考图上传、docx 导入 |
| `react-hook-form`、`jszip`、`cmdk` + shadcn | 设定、ZIP、资产搜索 |
| `mediabunny` | 预览成片拼接 |
| `react-resizable-panels`、`@tiptap/*` | 预览分栏、提示词 `@` |

不要为漫剧再引 ffmpeg.wasm、剪映官方库、第二套 Markdown、xyflow。

## 5. 验收

- 未指定模型时技能与生图/生视频走渠道默认
- 连跑分析/规划不丢已有 id 与媒体
- 旧六步 URL 可落到 Studio 路径
- Agent 可触发分析 / 规划 / 确认脚本 / 导航
- 剪映 zip 含 media 与 draft_content.json
