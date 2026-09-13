# TODO

## Phase 0 — 骨架与文档

- [x] monorepo + docker-compose + .env.example
- [x] docs 全套
- [x] joyai-engineering skill
- [x] packages/shared · packages/ai-providers 骨架
- [x] apps/server · web · admin 骨架

## Phase 1 — 核心 API

- [x] Prisma schema + migrate/push
- [x] Auth JWT + bootstrap admin
- [x] Settings
- [x] TOS Storage + upload
- [x] Swagger

## Phase 2 — 生成任务

- [x] volcengine Seedream / Seedance adapter
- [x] BullMQ image / video-submit / video-poll
- [x] Socket.IO job progress

## Phase 3 — 创作者 Web

- [x] 登录页
- [x] 首页对话式生图/生视频
- [x] 资产与历史

## Phase 4 — 无限画板

- [x] pan/zoom + 节点 CRUD
- [x] 自动保存快照
- [x] 触发生成与结果回写
- [x] Fabric 图片节点内编辑入口

## Phase 5 — Admin 与收口

- [x] 渠道 / 模型 / 用户 / 任务监控
- [x] NOTES 收口

## Phase 6 — 画板体验（规格见 [CANVAS.md](./CANVAS.md)）

参考源：Flora / LibTV / xyflow 等分层对照；**不以** `ai-comic-drama` 为标杆。

### P0

- [x] 框选 + Shift 多选 + 多选批量动作
- [x] 按类型 NodeToolbar（image / prompt / video / text）
- [x] 小地图增强（拖跳、缩放联动、开关记忆）
- [x] node registry（type → component / defaultData / toolbar）
- [x] 节点级生成运行态（进行中 / 失败 / 重试）
- [x] Fabric 导出 → 上传 Asset → 快照只存引用

### P1

- [x] 网格/轻微吸附
- [x] 快捷键与 dock 对齐
- [x] prompt `@` 引用高亮被引用节点
- [x] 从 Job/资产定位到画板节点

### P2（单独立项）

- [x] edges / handles（扩展 CanvasSnapshot 版本）
- [x] 扩图/局部重绘等改图 Job（可选）
- [x] 书面评估是否引入 `@xyflow/react`（见 [ADR-001-xyflow.md](./ADR-001-xyflow.md)：延期引入）

## Phase 7 — 画板精修（对齐 / 成组）

- [x] 多选对齐（左/中/右/顶/底）与水平/垂直分布
- [x] 轻量成组（`node.data.groupId`）：成组/解组、组拖动、虚线包围框

## 本地启动（需自行安装依赖）

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm build:packages
pnpm db:generate
pnpm db:push
pnpm dev:server
pnpm dev:web
pnpm dev:admin
```

填写 `.env` 中 `ARK_*` 与 `TOS_*` 后，Admin 可补渠道/模型，或依赖 bootstrap 自动建渠道。
