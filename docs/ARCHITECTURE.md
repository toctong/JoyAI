# Architecture

## Monorepo

```
apps/web       Next.js 创作者端 + 运维 UI（/admin，role 门禁）
apps/server    NestJS + Fastify API（TypeORM → SQLite sql.db）
packages/shared        共享类型 / zod / 画板契约
packages/ai-providers  Provider 适配器（首期 volcengine）
```

数据：SQLite 文件 `apps/server/data/sql.db`（`DATABASE_PATH=./data/sql.db`，TypeORM sql.js + synchronize）。Redis 仍用于 BullMQ。

## 请求与任务

1. Client → `POST /api/jobs` → 校验 → 写 Job → BullMQ 入队
2. Worker 调 `ai-providers` → 结果上传 TOS → 更新 Job/Asset
3. Socket.IO 推送进度；亦可 `GET /api/jobs/:id`
4. 视频：`video-submit` + `video-poll` 两队列

## Provider

业务模块只依赖 `packages/ai-providers` 接口，禁止在 jobs 里写死火山 URL。

## 画板

- Zustand 保存 viewport + nodes + edges（`CanvasSnapshot` v2）
- 大图只存 `assetId` / URL，禁止 base64 进快照
- Fabric 仅用于图片节点内编辑，非整页卡片引擎
- Board = pan/zoom + React 绝对节点（默认路径）；`@xyflow/react` 见 [ADR-001-xyflow.md](./ADR-001-xyflow.md)
- 参考源与体验规格：[CANVAS.md](./CANVAS.md)（不以 `ai-comic-drama` 为标杆）

## 核心 TypeORM 实体

User · Channel · Model · Job · Asset · CanvasProject · CanvasFolder · AppSetting · AuditLog
