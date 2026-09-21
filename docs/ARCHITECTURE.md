# Architecture

## Monorepo

```
apps/web       Next.js 创作者端 + 运维 UI（/admin，role 门禁）
apps/server    NestJS + Fastify API（TypeORM → SQLite sql.db）
packages/shared        共享类型 / zod / 画板契约
packages/ai-providers  Provider 适配器（OpenAI-compatible / DashScope / Volcengine）
```

创作者端视觉尺度在 `apps/web/src/shared/theme/design-tokens.css`（`--joy-*`），由 `globals.css` 引入。改字号、控件高度、画布工具图标时改 token，不在功能 CSS 里另起一套像素。

数据：SQLite 文件 `apps/server/data/sql.db`（`DATABASE_PATH=./data/sql.db`，TypeORM sql.js + synchronize）。Redis 仍用于 BullMQ。

## 请求与任务

1. Client → `POST /api/jobs` → 校验 → 写 Job → BullMQ 入队
2. Worker 调 `ai-providers` → 结果上传 TOS → 更新 Job/Asset
3. Socket.IO 推送进度；亦可 `GET /api/jobs/:id`
4. 视频：`video-submit` + `video-poll` 两队列

## Provider

业务模块只依赖 `packages/ai-providers` 接口，禁止在 jobs / 功能代码里写死厂商 URL。图像、视频、音频、AI 工具都走 `POST /api/jobs`。

## 画板

- Zustand 保存 viewport + nodes + edges（`CanvasSnapshot` v2）
- 大图只存 `assetId` / URL，禁止 base64 进快照
- Fabric 仅用于图片节点内编辑，非整页卡片引擎
- Board = pan/zoom + React 绝对节点（默认路径）；`@xyflow/react` 见 [ADR-001-xyflow.md](./ADR-001-xyflow.md)
- 参考源与体验规格：[CANVAS.md](./CANVAS.md)（不以 `ai-comic-drama` 为标杆）

## 漫剧

独立项目，当前不和画布互写。阶段、技能与配置见 [MANJU.md](./MANJU.md)。

## AI 工具

`/tools` 目录来自 `tool-catalog.ts`，一工具一页，不单独开路由模块。图生图填参考图；品牌 / 海报类可以零参考图，但品牌说明必填（`noteRequired` + `brand-brief`）。提交任务时写入 `input.toolSlug`，历史用 `scope=tools&toolSlug=` 查询。

## 任务 / 资产隔离

- `GET /jobs?scope=studio`：仅创作台（排除画布 / 漫剧 / 工具）；SQL 先收窄再分页，避免一次拉全量任务
- `GET /jobs?scope=canvas&canvasProjectId=`：仅该画布项目
- `GET /jobs?scope=manju&manjuProjectId=`：仅该漫剧项目
- `GET /jobs?scope=tools&toolSlug=`：仅该 AI 工具
- `GET /assets`：可查全部，或按 `source=studio|canvas|manju|tools|upload` 分类（优先按列过滤）；列表项带 `thumbUrl`（TOS `x-tos-process` 缩略图），详情 / 下载仍用原图 `url`
- 前端：`job:progress` 只更新本地进度，完成 / 失败再拉列表

## 对象存储

- 上传 / mirror 走内容寻址 `uploads/by-hash/{md5}.{ext}`；同 MD5 不重复 put
- Mirror 尽量不拉字节：本桶 URL、远端 Content-MD5 命中、或已有 Asset 镜像过同一 `originUrl`
- 列表缩略图用 TOS `x-tos-process`（见 `@joyai/shared` `tosThumbUrl`），不另存缩略文件；视频列表用 `video/snapshot` 封面，不在格子里拉整段 mp4
- 未引用 GC：`GET/POST /admin/storage/gc`；定时 sweeper 默认只扫描日志，见 `STORAGE_GC_*`

## 核心 TypeORM 实体

User · Channel · Model · Job · Asset · CanvasProject · CanvasFolder · ProjectChat · ManjuProject · ManjuFolder · AppSetting · AuditLog
