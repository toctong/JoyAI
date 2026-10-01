# 漫剧 E2E 测试文档 · 掩耳盗铃

| 项 | 内容 |
|----|------|
| 项目 ID | `cmup7iu5v613a7089dfaab506` |
| 标题 | 掩耳盗铃 |
| 选题 | 成语寓言 · 建议 1～3 集 |
| 账号 | `admin` / `admin123` |
| 环境 | Web `http://localhost:9000` · API `http://localhost:3001` |
| 依赖 | Docker MySQL + Redis · Nest + BullMQ workers |
| 文档日期 | 2026-10-01 |
| 对照 | 上轮成语 [manju-e2e-idiom-test-notes.md](./manju-e2e-idiom-test-notes.md)（守株待兔） |

**入口：** [工作室工作室工作室/manju/cmup7iu5v613a7089dfaab506](http://localhost:9000/manju/cmup7iu5v613a7089dfaab506)

---

## 0. 当前基线（本轮 API 实测已写入）

| 字段 | 状态 |
|------|------|
| 初始设定 | ✅ 9:16 · I2V · styleId=`fantasy3d`（3D 玄幻国漫）· 时长 5s |
| 模型 | LLM=`Kimi K2.5` · 图=`GPT Image 2` · 视频=`Seedance 2 Mini` |
| 剧本 | ✅ 已写入第 1 集短剧本（约 237 字） |
| 解析资产 | ✅ 8 资产（角色 3 / 场景 2 / 道具 3）· tags=`古装,寓言,讽刺,喜剧` |
| 分集 | ✅ `cmup7ycaid3f2c76563ea4490` · 标题「掩耳盗铃·第1集」 |
| 脚本确认 | ✅ `scriptConfirmed=true` |
| 分镜规划 | ✅ 9 镜（有 visual / dialogue / assetRefs；**尚未写提示词 / 生图 / 生视频**） |
| 资产参考图 | ❌ 0/8 |
| 任务 Job | analyze `cmup7xv6h8c2765f37715b697` · script_plan `cmup7ydu6d266792fb9597123` |

**workflow API 当前：**

```json
{
  "phase": "production",
  "scriptConfirmed": true,
  "blockers": ["no_asset_images", "storyboard_incomplete"],
  "nextAction": "analyze_assets",
  "counts": { "assets": 8, "assetsWithImage": 0, "shots": 9, "storyboards": 0, "videos": 0 }
}
```

> 注意：`nextAction=analyze_assets` 在「已有资产但无参考图」时语义错误，前端侧栏引导更准确（见 §5）。

---

## 1. 技术栈与测试手段

### 1.1 产品技术栈（测什么要懂什么）

| 层 | 技术 | 漫剧相关用途 |
|----|------|----------------|
| Web | Next.js App Router · React · Zustand · shadcn | `/manju/...` Studio 三栏、制作台、预览 |
| API | NestJS · Fastify · JWT | `/api/manju/*`、`/api/jobs` |
| 异步 | BullMQ · Redis | `llm` / `image` / `video` / `audio` 全走 Job |
| 模型 | `@joyai/ai-providers` + 管理后台渠道模型 | 帮写 / 解析 / 规划 / 写词 / 生图 / I2V |
| 存储 | MySQL `manju_project.draft` JSON · `job` · `asset` · `project_chat` | **无独立剧集/分镜表**，一切在 draft |
| 实时 | Socket.IO | Job 状态推送 |
| 成片 | 浏览器 `mediabunny` · `jszip` · 剪映 zip API | **无服务端 FFmpeg** |
| 编辑 | TipTap · MD Editor · dnd-kit · plyr | 提示词 `@`、剧本、分镜排序、预览播放 |

### 1.2 推荐测试组合

| 手段 | 适用 |
|------|------|
| **浏览器人工 E2E**（主） | 向导、帮写应用、制作台、批量生图/视频、预览导出 |
| **API 冒烟**（辅） | `GET project/workflow`、`POST /jobs`、确认脚本、剪映导出 |
| **DB 抽查** | `manju_project` / `job` / `project_chat` 对账 |
| **自动化** | 仓库内 **尚无** manju `*.spec` / Playwright；本文件作手测真源 |

### 1.3 关键 API（需 Bearer JWT）

```http
POST /api/auth/login
GET  /api/manju/projects/{id}
PATCH /api/manju/projects/{id}          # draft 必须整份！见 §5.1
GET  /api/manju/projects/{id}/workflow
GET|PUT /api/manju/projects/{id}/script-chat
GET|PUT /api/manju/projects/{id}/agent-chat
GET|PUT /api/manju/projects/{id}/script-review
POST /api/manju/projects/{id}/script-review/confirm
GET  /api/manju/projects/{id}/export/jianying?episodeId=
POST /api/jobs                          # kind=llm|image|video|audio
GET  /api/jobs?scope=manju&manjuProjectId=
```

LLM purpose：`script_write` · `analyze_assets` · `script_plan` · `author_prompts` · `plan_episodes` · `novel_analyze` · `series_memory` · `manju_review`

---

## 2. 完整流程清单（主路径）

约定：每步勾选 **通过 / 失败 / 跳过**，失败时记下 toast、Job id、截图。

### A. 项目与设定（本项目已完成，回归时重跑）

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| A1 | 登录 | `/login` admin | 进入应用 | ☐ |
| A2 | 打开项目 | `/manju/cmup7iu5v613a7089dfaab506` | 概览可见标题「掩耳盗铃」 | ☐ |
| A3 | 初始设定 | `/settings` | 画幅 9:16、I2V、风格/三模型与库一致；保存不丢 | ☐ |
| A4 | 工作流条 | 侧栏「建议下一步」 | 有剧本后引导「解析/资产生图/制作」而非空白 | ☐ |

### B. 剧本与 AI 帮写

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| B1 | 打开剧本 | `/source` | 可见已写入的第 1 集正文 | ☐ |
| B2 | 题材芯片 | 帮写面板 | **默认不选题材**；可选「成语故事/寓言」；不误带「都市情感」 | ☐ |
| B3 | AI 帮写 | `script_write` 生成/润色 → 应用 | 回写 `scriptText`+tags；hook 不进正文 | ☐ |
| B4 | 失败可恢复 | 故意选坏模型或断网 | toast 中文可读；输入框解锁；可引导换模型 | ☐ |
| B5 | 会话持久 | 刷新后再开帮写 | `manju-script` 会话仍在 | ☐ |

### C. 解析资产与设定库

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| C1 | 解析剧本 | 点解析 / Agent `analyze_assets` | 角色/场景/道具 + overview + tags + 第 1 集；**不丢已有 settings 模型** | ☐ |
| C2 | 资产列表 | `/characters` `/scenes` `/props` | 与基线 8 条一致可编辑 | ☐ |
| C3 | 解析失败兜底 | （可另项制造失败） | 弹出兜底：抽对白角色 / 粘贴名单 / 稍后 | ☐ |
| C4 | 一键定妆 | 角色页「一键定妆缺失角色」 | 为无图角色提交 image Job；列表出图 | ☐ |
| C5 | 单张生图 | 阿瞒 / 外院 / 青铜大钟 各 1 张 | `imageUrl` 回写；资产库可见 | ☐ |
| C6 | 无参考图警告 | 未出图直接进制作台 | 提示可去定妆，可仍继续 | ☐ |

### D. 剧集与续写

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| D1 | 剧集列表 | `/episodes` | 可见第 1 集；制作/续写入口可用 | ☐ |
| D2 | 续写下集 | 打开续写弹层 | 钩子来自本集正文末；序号正确；题材不污染 | ☐ |
| D3 | 应用续写 | 创建第 2 集 | **新建 episode**，不覆盖全剧 `scriptText`；弹层状态重置 | ☐ |
| D4 | 新角色入库 | 续写若出现新角色 | 提示是否加入资产 | ☐ |
| D5 | 完结模式 | 开「完结本集」 | 无下集钩子；不鼓励再开 N+1 | ☐ |
| D6 | 标题质量 | 列表展示 | 避免 `#2-第2集：…` 双重序号；不过度截断 | ☐ |

### E. 制作台（本集核心）

入口：剧集「制作视频」→ 新 tab  
`/manju/cmup7iu5v613a7089dfaab506/episodes/cmup7ycaid3f2c76563ea4490`  
（空分镜时可用 `?plan=1` 自动规划；本项目已有 9 镜）

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| E1 | 打开制作台 | 新窗口 | 左分镜表 9 镜；镜号集内显示 `1-1…1-9` | ☐ |
| E2 | 脚本门禁 | 未确认时批量写词/出视频 | 拦截并引导确认；本项目已确认应可过 | ☐ |
| E3 | 改对白再确认 | 改一镜对白 | 是否再次要求确认（体验偏重则记 P2） | ☐ |
| E4 | 写提示词 | 单镜 / 本集批量 `author_prompts` | toast 文案为「写词」非「规划」；`imagePrompt`/`videoPrompt` 回写；含 `@[登记名]` | ☐ |
| E5 | 本集全部生图 | 批量 | 进度 `i/n`；静帧回写；失败可点开 Job 错误 | ☐ |
| E6 | 本集全部生视频 | I2V 批量 | 需静帧；mode 锁定；视频可播 | ☐ |
| E7 | 单镜重做 | 改 visual 后重出 | stale 标记；可批量重做过期项 | ☐ |
| E8 | Agent | 右侧 Agent | 可 `navigate` / `run_skill` / `confirm_script`；与帮写会话分离 | ☐ |

### F. 预览与导出

| # | 步骤 | 操作 | 期望 | 结果 |
|---|------|------|------|------|
| F1 | 预览页 | `/preview` | **按集切换**时间线；有视频的镜可顺序播 | ☐ |
| F2 | 播放器 | 点播 | 初始时间合理；可拖进度 | ☐ |
| F3 | 打包 ZIP | 下载 | 含媒体文件 | ☐ |
| F4 | 导出成片 | mediabunny | 浏览器内拼出 MP4 | ☐ |
| F5 | 推送画布 | 推送 | 新建画布项目；只带 assetId/url；**不回写**漫剧 | ☐ |
| F6 | 导出 JSON | | draft 结构完整 | ☐ |
| F7 | 剪映 zip | `export/jianying?episodeId=` | 含 `draft_content.json` + `media/` | ☐ |
| F8 | BGM | — | 入口已隐藏（未接入），不再测 | — |

### G. 回归 / 边界

| # | 步骤 | 期望 | 结果 |
|---|------|------|------|
| G1 | 旧 URL `?step=` / `?panel=` | 重定向到 Studio 路径 | ☐ |
| G2 | 连跑解析不丢媒体 | 有图后再 incremental 解析 | 保留 id 与 imageUrl | ☐ |
| G3 | `clear_reparse` | 清资产/标签/梗概 | **保留**分集与已生成镜头媒体 | ☐ |
| G4 | mode 锁定 | 首次提交视频后 | 不可再改 i2v/ref/grid | ☐ |
| G5 | 制作检查 `manju_review` | 概览/Agent | 报告写入 `lastReview`，不改稿 | ☐ |
| G6 | 长文拆集 `novel_analyze` | 另测长文 | overview/tags/分集草案，不改资产镜头 | ☐ |

---

## 3. 本轮建议执行顺序（接着测）

项目已停在「有分镜、无资产图、无提示词、无视频」。建议：

1. **浏览器打开设定库** → 一键定妆阿瞒 + 外院 + 青铜大钟（至少 3 张主参考；画外音角色应被跳过）  
2. **制作台** → 看顶栏参考图覆盖率 → 点「一键拉通」（或分步：写词 → 全部生图 → 全部 I2V；可先只做前 3 镜控成本）  
3. **预览** → 连播 / ZIP / 成片 / 推画布 / 剪映  
4. **续写第 2 集**（被捕抓 / 寓意点题）→ 再跑半套制作  
5. 边测边往 §5 补问题

**预估耗时：** 仅 LLM 链路约 1～2 分钟已验证；全量 9 镜图+视频视渠道排队 **数十分钟～更久**。

---

## 4. 验收标准（Definition of Done）

主路径 DoD（单集最短闭环）：

1. 设定保存后刷新不丢模型与风格  
2. 剧本 → 解析 → 至少 1 角色有参考图  
3. 确认脚本 → 规划分镜 → 写词 → ≥3 镜有静帧与视频  
4. 预览可连播；ZIP 或成片或剪映至少一种导出成功  
5. 任一步 AI 失败有中文 toast，且 UI 不永久 disabled  

系列扩展 DoD：续写创建第 2 集 + 新角色可入库提示 + 第 2 集可独立制作。

---

## 5. 不足与待完善（本轮实测 + 规格对照）

### 5.1 P0 · 阻断 / 数据风险

| ID | 问题 | 证据 / 影响 | 建议 |
|----|------|-------------|------|
| P0-1 | ~~**`PATCH draft` 整份覆盖**~~ **已修** | 缺字段会落到默认值、清空资产 | `mergeManjuDraftPatch`：顶层按字段合并，settings/scriptReview/series 浅合并 |
| P0-2 | ~~**无资产图时 workflow.`nextAction` 仍为 `analyze_assets`**~~ **已修** | blockers=`no_asset_images` 却推解析 | 有资产无图 → `generate_asset_images`；并返回 `nextActionLabel` |
| P0-3 | **LLM/渠道空响应或错误模型仍可能卡流程** | 上轮 Gemini 空内容；本轮 Kimi 可用。默认模型健康度仍依赖后台配置 | 渠道健康检查；项目设置显式展示当前 LLM；失败强制解锁。**部分已做**：失败 toast 带上游 `remoteTaskId` + 换模型引导 |
| P0-4 | ~~**ToAPIs 生图「已完成但未返回 URL」误报**~~ **已修** | 控制台有缩略图，本站却失败 | 优先 `/images/generations/{id}`；空成功宽限 ~40s |
| P0-5 | ~~**预览 Plyr `removeChild` 崩溃**~~ **已修** | Runtime NotFoundError on video | `StudioPlyrPlayer` 改为宿主 div 命令式挂载 |

### 5.2 P1 · 正确性 / 体验

| ID | 问题 | 建议 |
|----|------|------|
| P1-1 | 剧集标题易带「第N集/作品名」冗余（本项目「掩耳盗铃·第1集」） | 生成时去重列表序号前缀 |
| P1-2 | ~~画外音角色也强制定妆~~ | ✅ `voiceOnly` + 一键定妆/参考图覆盖率跳过 |
| P1-3 | 脚本确认闸门：改对白再次确认，批量迭代偏重 | 轻微编辑不撤确认；或「仅结构变更才撤」 |
| P1-4 | 镜号 DB 仍为全局 `index`，UI 已按集显示 | 文档化；或存储改为集内序号 + 全局序 |
| P1-5 | 成语故事却选「玄幻国漫」风格易风格漂移 | 题材模板与风格推荐联动 |
| P1-6 | ~~缺少参考图覆盖率~~ | ✅ 制作台顶栏「参考图 n/m」芯片（缺图高亮） |

### 5.3 P2 · 效率 / 产品缺口

| ID | 问题 | 建议 |
|----|------|------|
| P2-1 | ~~无「一键拉通」~~ | ✅ 制作台「一键拉通」：规划→确认→写词→批量图→批量视频 |
| P2-2 | ~~BGM / 人设 AI 总结「即将接入」~~ | ✅ 入口已隐藏 |
| P2-3 | 明确不做：全片 TTS、字幕烧录、服务端 FFmpeg、末帧抽帧、画布双向同步 | 保持边界；若要成片字幕走导出 SRT（P3） |
| P2-4 | 角色 TTS 对话框存在，但不是成片配音流水线 | 文档标明「音色参考 ≠ 全片配音」 |
| P2-5 | 无自动化回归（Playwright / API e2e） | 先做：login → get project → workflow → analyze 冒烟 |
| P2-6 | 多宫格 `grid` 模式批量路径与 I2V 不一致 | 统一批量入口文案与跳转 |

### 5.4 P3 · 次要

- 预览播放器初始时间偶发异常（上轮）  
- Agent 部分入口禁用属预期  
- 导出 SRT / 对白轨  
- Next.js Dev overlay 干扰点击（仅开发环境）

### 5.5 已在上轮修好、本轮应回归确认

题材默认空、续写钩子/完结/新角色提示、集内镜号展示、批量生图视频、定妆、解析兜底、LLM 失败解锁、预览按集切换、全站异常中文化与 API 闪断重试。

### 5.6 本轮优化已落地（2026-10-01）

- Job 失败 toast：上游 `remoteTaskId` + 图/视频/LLM 换模型提示  
- 资产 `voiceOnly`（解析 + 启发式）；一键定妆 / 缺图确认 / 覆盖率跳过画外音  
- 制作台顶栏参考图覆盖率芯片 +「一键拉通」  
- 隐藏 BGM、人设「AI 总结」假入口  
- `PATCH draft` 合并、`generate_asset_images` nextAction、ToAPIs 轮询、Plyr 宿主挂载（见 §5.1）

---

## 6. 问题记录模板（边测边贴）

```
### [P?] 标题
- 步骤：E5 本集全部生图
- 复现：…
- 期望：…
- 实际：…
- Job：…
- 截图/日志：…
```

---

## 7. SQL / 对账（可选）

```sql
SELECT id, title,
       JSON_LENGTH(draft, '$.episodes') AS episodes,
       JSON_LENGTH(draft, '$.assets')   AS assets,
       JSON_LENGTH(draft, '$.shots')    AS shots,
       draft->>'$.phase' AS phase,
       draft->>'$.scriptConfirmed' AS confirmed,
       draft->>'$.settings.llmModelId' AS llm,
       draft->>'$.settings.styleId' AS styleId
FROM manju_project
WHERE id = 'cmup7iu5v613a7089dfaab506';

SELECT id, kind, status, createdAt,
       JSON_UNQUOTE(JSON_EXTRACT(input, '$.purpose')) AS purpose
FROM job
WHERE JSON_UNQUOTE(JSON_EXTRACT(input, '$.manjuProjectId'))
      = 'cmup7iu5v613a7089dfaab506'
ORDER BY createdAt DESC
LIMIT 30;
```

基线快照（机器可读）：`docs/_tmp/yanerdaoling-baseline.json`

---

## 8. 本轮结论

### 全流程实测结果（2026-10-01）

| 阶段 | 结果 |
|------|------|
| 设定 / 剧本 / 解析 / 确认 / 规划 | ✅ |
| 写提示词 | ✅ 9/9 |
| 资产生图 | ✅ 8/8（修 ToAPIs 轮询后） |
| 分镜静帧 | ✅ 9/9 |
| I2V 视频 | ✅ 9/9 |
| workflow | ✅ `nextAction=preview`，blockers 空 |
| 剪映导出 | ✅ ~54MB zip → `docs/_tmp/yanerdaoling-jianying.zip` |

预览入口：[/manju/cmup7iu5v613a7089dfaab506/preview](http://localhost:9000/manju/cmup7iu5v613a7089dfaab506/preview)

### 本轮已修缺陷

1. **ToAPIs「已完成但未返回图片 URL」误报**（`packages/ai-providers`）  
2. **预览 `removeChild` 崩溃**（`StudioPlyrPlayer` 宿主挂载）  
3. **PATCH draft 部分字段覆盖毁稿**（`mergeManjuDraftPatch`）  
4. **workflow 无图仍推解析**（改为 `generate_asset_images` + `nextActionLabel`）

### 请你浏览器点验（客户端能力，API 无法代跑）

1. [/preview](http://localhost:9000/manju/cmup7iu5v613a7089dfaab506/preview) 连播 9 镜、切换分集（目前仅 1 集）  
2. 「导出成片」mediabunny 拼 MP4  
3. 「推送分镜到画布」  
4. 剧集页「续写下集」成语收束  
5. 刷新预览页确认不再弹出 `removeChild` 红屏

报告快照：`docs/_tmp/yanerdaoling-resume-report.json` · 剪映包：`docs/_tmp/yanerdaoling-jianying.zip`
