# 漫剧 — 分批实现与参考规格

漫剧是独立的结构化项目：剧本、资产、分镜、镜头视频都在 `/manju` 里完成。和画布的导入、写回以后再做，不进当前批次，也不要在漫剧页上留「打开画布」入口。

实现约束见 `.cursor/skills/joyai-engineering/SKILL.md` 与 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 参考谁、参考什么

不必五个项目并列参考。GitHub 上这条赛道大多是同一套「小说 → 分镜 → 首尾帧 → 视频」的分叉，多看几个不会多出一种架构。

当前批次只对照 ArcReel。Toonflow 留到以后做画布对接时再看，现在不跟。

| 来源 | 星数量级 | 只借鉴 | 不借鉴 |
|------|----------|--------|--------|
| [ArcReel](https://github.com/ArcReel/ArcReel) 的 drama | 约 4 千 | 当前唯一对照：阶段顺序、资产一致性、分集、确认后再写提示词、按名称/镜号合并且不覆盖已有媒体 | 代码（AGPL）、Claude Agent SDK、ComfyUI、FFmpeg 成片、剪映草稿、旁白配音、以及它自己的画布/导出 |
| [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app) | 约 1.1 万 | 先不参考。它值钱的是漫剧和无限画布怎么接，那部分以后再做 | 现在不要把它的画布工作台做进漫剧 |

只读流程和数据结构，用本仓栈重写。禁止整页、整模块、提示词原文粘贴。

上一镜落幅接到下一镜起幅，是这条赛道的常识，写进 `i2v` 规则即可，不必再单挂一个仓库。

下面这些看过，确认和上面重复，或和 JoyAI 的约束冲突，不作为参考源：

| 仓库 | 为什么不跟 |
|------|------------|
| [AIComicBuilder](https://github.com/twwch/AIComicBuilder)、[ai-comic-studio](https://github.com/neilalexanderlee/ai-comic-studio)、[ai-shotlive](https://github.com/sorker/ai-shotlive) | 都是关键帧流水线。ai-shotlive 自己写明参考了 BigBanana、CineGen、Toonflow。步骤表、四视图、看板和 ArcReel 的分镜阶段重复 |
| [LumenX](https://github.com/alibaba/lumenx) | 「工作室 + 独立生成台」我们本来就是创作台和漫剧两个入口。它绑 DashScope，生成台也不是节点画布 |
| [ManjuForge](https://github.com/mengxiujie/ManjuForge) | 连载提示词包，不是工作台。等人设/伏笔真要做时再看字段，不进前几批 |
| [wind-comic](https://github.com/bishuan/wind-comic)、[story-claw](https://github.com/ZC89757/story-claw)、[Muse-Studio](https://github.com/benjiyaya/Muse-Studio) | 目标是一条龙出成片，且依赖 ComfyUI 或自建多 Agent。JoyAI 走渠道模型和任务队列，不接 Comfy |
| [OpenStory](https://github.com/openstory-so/openstory) | 从一句话到多场景成片的平台，不是「项目草稿 + 现有画布」 |

## 2. 怎么设计才合理

### 2.1 漫剧自己闭环

- **创作 `/studio`** 仍是单次生图/生视频，和漫剧无关。
- **漫剧 `/manju`** 一个项目一份 `ManjuDraft`。出图、出视频、预览都在这里完成。步骤可来回点，但有门禁：未确认脚本不能让模型改对白；已有媒体不能被分析任务整表替换。
- **画布** 本阶段不读、不写漫剧草稿。不要加 `canvasProjectId`，不要在节点 `data` 里塞 `manjuShotId`。

### 2.2 一份草稿，三层覆盖

配置不要散落在组件里。生效顺序：

1. **渠道默认**：管理后台已启用的 `llm` / `image` / `video` 模型。项目未指定 `modelId` 时用渠道里该 kind 的默认模型。
2. **项目设定** `draft.settings`：画幅、风格、默认时长、生成模式、本项目用的三个模型 id。
3. **单镜覆盖**：`shot.duration` 非空时覆盖项目时长。参考图以该镜 `assetRefs` 为准，不把项目里所有资产都塞进去。

不要做第四层「全局漫剧风格」。用户换项目就换风格。若以后要记住「上次用的模型」，只记在浏览器，不进草稿。

`settings.mode`：

| 模式 | 提交给视频任务的参考 | 状态 |
|------|----------------------|------|
| `i2v` | 首帧 = 上一镜分镜图（没有则本镜），末帧 = 本镜分镜图 | 当前默认 |
| `ref` | 只挂该镜关联资产图，不混分镜首帧 | 已接 |
| `grid` | 未实现。界面上标明，提交时降级为 `i2v`，不要假装已切宫格 | 先不做 |

进入分镜视频后锁定 `mode`，避免同一项目前几镜用参考、后几镜用首帧。

### 2.3 合并规则

LLM 回写必须非破坏：

- 资产按 `kind + name` 合并，保留已有 `imageUrl` / `assetId`。
- 分集按 `title` 合并，保留 `episodeId`，镜头上的 `episodeId` 才不会断。
- 分镜按全局 `index` 合并。保留 `id`、提示词、媒体、单镜时长。画面和对白以新规划为准。
- `author_prompts` 只按 `index` 写 `imagePrompt` / `videoPrompt`。序号对不上的条目跳过，不能按数组下标硬套。改画面或对白会取消 `scriptConfirmed`。

### 2.4 技能不是 Agent

一个技能 = 一段系统提示词 + 一次 `kind: "llm"` 任务 + 服务端用 zod 回写草稿。不要上 Agent SDK，不要让一个技能又拆资产又写分镜又写提示词。

现有三个技能（`apps/server/src/modules/jobs/llm-prompts.ts`）：

| purpose | 只做什么 | 用户消息里必须有 |
|---------|----------|------------------|
| `analyze_assets` | 梗概、角色/场景/道具、分集。不写镜头 | 原文 |
| `script_plan` | 镜头的画面、对白、`assetNames`、`episodeTitle` | 资产名单、分集标题、原文 |
| `author_prompts` | 按全局 `#index` 补画面词和视频词 | 风格、画幅、已锁定镜头（含全局镜号） |

运行时拼装（`apps/web/src/features/manju/lib/prompt-builders.ts`）才是真正提交给图像/视频模型的字符串：把 `@[登记名]` 换成 `图N`，带上参考图和 Avoid。技能提示词里不要写供应商参数。

以后可以加、但不要插进前三个技能的：

- 连载记忆（人设、世界观、伏笔）——参考 ManjuForge 的字段，单独一次 LLM，写入 `draft` 新块，不改已确认对白。
- 旁白 / TTS、成片拼接——明确不做，直到产品单独开需求。

## 3. 分批

每一批都要能单独使用，不依赖下一批。下一批开始前，上一批的类型在 `@joyai/shared` 里，任务仍走 `POST /api/jobs`。

### 批次 A — 把现有流水线收稳

已有骨架：六步、三个技能、渠道生图生视频、按镜号/标题合并、预览连播。这一批只补会让人误以为「坏了」的缺口。

- 剧本与各长文本使用 `ManjuMdField`，整块可点可输。
- 顶栏建议动作真正调用 `analyze_assets` / `script_plan` / `author_prompts`，或确认脚本。
- 分镜页可规划、可确认；提示词页不再指向已删除的侧栏。
- 批量生成跳过已有图/视频。覆盖分镜前要确认。
- `grid` 在界面上保持「未实现」。

不做：画布导入或写回、新技能、成片导出。

### 批次 B — 项目配置收口

- 项目设定页是唯一改 `settings` 的地方：画幅、风格、默认时长、模式、三个模型。
- 单镜时长只在分镜视频卡片上改，空则继承项目。
- 未选模型时展示「渠道默认」，提交时不传空字符串。
- 首次提交视频后锁定模式，并在设定页说明原因。
- 导出 JSON 含完整 `draft`，导入走现有创建项目接口，不另做文件格式。

不做：账号级漫剧预设、管理后台专用漫剧配置。

### 批次 C — 连续性与参考图

- `i2v`：首帧上一镜、末帧本镜；第一镜只有本镜。
- `ref`：只提交该镜 `assetRefs` 里已有图的资产。
- 角色参考图规格在 `prompt-builders` 里写死（三视图句式），不让模型自由发挥版式。
- 资产可上传参考图，上传结果与生成结果一样进 `assetId`。

不做：宫格切块、自动把上一镜视频末帧抽出来（那需要抽帧，先不做）。

### 批次 D — 技能补强

只在 A–C 稳定后做。

- `script_plan` 的用户消息始终带资产名和分集标题；模型乱编号时服务端拒绝整表覆盖，保留旧镜头。
- 分集内重跑 `author_prompts` 时，系统提示强调全局 `#index`。
- 可选：连载字段（角色小传、未回收伏笔）单独技能，参考 ManjuForge 的结构，输出 JSON 进 `draft`，不参与生图。

明确不做：Agent 多轮工具调用、配音、字幕烧录、FFmpeg 拼接、剪映草稿、和画布互相同步。

画布对接整段推迟。到那时再对照 Toonflow，单独开一批，不从现在的草稿字段里预埋 `canvasProjectId`。

## 4. 插件与依赖

优先用仓库里已经装好的，不要为漫剧再手写一套编辑器、排序、播放器或弹层。新能力先查 `apps/web/package.json` 和 `components/ui/`，没有再加依赖。界面组件走官方 shadcn（`npx shadcn@latest add`），不手写无 Radix 的仿件。

### 4.1 已经在用，继续用

| 依赖 | 用在哪 |
|------|--------|
| `@uiw/react-md-editor` | 剧本、梗概、资产描述、画面、对白、提示词。封装在 `ManjuMdField`，跟 `next-themes` 的 light/dark。工具栏中文用同包的 `commands-cn`，与画布编辑器一致 |
| `@dnd-kit/core`、`sortable`、`utilities` | 分镜卡片排序。不要自己写拖拽 |
| `plyr` | 单镜视频和预览连播。封装沿用 `StudioPlyrPlayer` |
| `react-photo-view` | 参考图、分镜图点击放大。用现有 `JoyPhotoProvider` |
| `zustand` | `manju-store`。草稿不要再复制一份到 React Query |
| `zod`（`@joyai/shared`） | `ManjuDraft` 与三个技能的 JSON 回写 |
| `socket.io-client` | 任务进度和完成回写 |
| `dayjs` + `relativeTime` | 项目列表的相对时间 |
| `lucide-react` | 图标 |
| `react-hot-toast` | 现有 `toast`，不另引一套通知 |

shadcn 已有、漫剧直接用：`button` `input` `select` `tabs` `accordion` `collapsible` `dropdown-menu` `scroll-area` `dialog` `alert-dialog` `tooltip` `progress` `slider` `badge` `skeleton` `separator` `label`。确认框用现有 `confirmDialog`（包在 Alert Dialog 上），不用 `window.confirm`。

### 4.2 已经装了，漫剧还没接上

| 依赖 | 何时用 |
|------|--------|
| `react-dropzone` | 批次 C 的参考图上传。替换现在的裸 `<input type="file">`，限制图片类型和大小 |
| `react-hook-form` + `@hookform/resolvers` | 批次 B。项目设定如果从一排 chip 收成表单，用它配 `ManjuVideoSettingsSchema`，不要再堆本地 `useState` |
| `react-resizable-panels` | 分镜和预览若要左右分栏（列表 / 播放器）。已有 `components/ui/resizable`，不要写拖拽分割条 |
| `@tiptap/react` 及已装的 Mention 扩展 | 只用于画面/视频提示词里的 `@[资产名]` 补全。剧本正文仍用 Markdown 编辑器，两套不要互换 |

### 4.3 还没装、值得加的时候再装

| 依赖 | 为什么 | 哪一批 |
|------|--------|--------|
| `jszip` | 预览里「打包下载本集」现在是连续点多个链接，浏览器会拦。打成一个 zip 再下 | 批次 A 收尾或预览补强 |
| shadcn `command`（底层 `cmdk`） | 镜头上挑选资产、跳转分集。人多了以后比一排 chip 好点 | 资产超过一屏时 |
| shadcn `sonner` | 不必换。现有 toast 够用，不要两套通知并存 | 不装 |

安装命令保持仓库现有方式：前端依赖加在 `apps/web`，用 pnpm。不把插件只写进某一个步骤文件里再动态从 CDN 拉。

### 4.4 不要为漫剧引入

- `ffmpeg` / `ffmpeg.wasm`、剪映工程库：成片拼接不在这几批。
- ComfyUI 相关包。
- 另一套 Markdown 或富文本（例如再装 Milkdown、ByteMD）。长文本只留 `@uiw/react-md-editor`。
- 另一套画布（`@xyflow/react`、tldraw）。本阶段漫剧不导入画布。

## 5. 验收

- 不指定模型时，三个技能和生图生视频都走渠道默认，失败信息指向「没有可用模型」而不是供应商 URL。
- 对同一项目连跑两次「分析资产」「规划分镜」，资产 id、分集 id、已有图片和视频还在。
- 确认脚本之后改对白，提示词技能被挡住，直到再次确认。
- 漫剧页没有跳进画布的按钮，草稿里也没有画布项目 id。
