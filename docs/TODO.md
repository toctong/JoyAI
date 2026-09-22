# TODO

## Phase 0 — 骨架与文档

- [x] monorepo + docker-compose + .env.example
- [x] docs 全套
- [x] joyai-engineering skill
- [x] packages/shared · packages/ai-providers 骨架
- [x] apps/server · web 骨架（运维 UI 合入 web `/admin`；`apps/admin` 已移除）

## Phase 1 — 核心 API

- [x] TypeORM schema + MySQL synchronize（原 SQLite / Prisma 已移除）
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

## Phase 11 — 图像本地改图

- [x] 裁剪 / 切图 / 本地插值放大（新图像节点 + Asset，快照不存 base64）
- [x] 查看大图、复制连入提示词、自由比例（`freeResize`）

## Phase 12 — 信息 / 字号 / 截取 / 涂抹

- [x] 节点信息、文本字号
- [x] 音频截取（新音频节点 + Asset）
- [x] 局部涂抹 → 标记图 + inpaint 提示词节点

## Phase 13 — 连线命中 / 参考条

- [x] 浅色主题连线可见，点线可选中删除
- [x] 拖线松手命中最上层节点
- [x] 提示词节点参考条可断开连入边

## Phase 14 — 叠放 / 微调 / 拖入编组

- [x] 置于顶层 / 底层，以及上下一层
- [x] 方向键微调
- [x] 拖入已有编组；Alt 拖动可移出

## Phase 15 — 复制 / 视口 / 高度

- [x] 复制不继承进行中任务，同组多选复制成新组，并带上内部连线
- [x] 滚轮与拖动使用当前缩放；生成完成不抢走选中
- [x] 文本 / 提示词高度与连线对齐；`1` 适应选中

## Phase 16 — 3D 导演台（three.js SPA）

- [x] 安装 `three`；接入 `/director` 静态导演台（非自研舞台）
- [x] 打开即可用；可选连入全景/图像；截图/视频落画布 Asset

## Phase 17 — 批量出图 / 项目 JSON / Agent

- [x] 生图张数 1–4 + 多结果落点
- [x] 项目 JSON 导出/导入（顶栏 + 项目库）；创建可带 snapshot
- [x] 画布 Agent MVP（右侧 AI 面板，JSON actions，无 Codex/MCP）
- [x] 多轮工具循环 + inspect/update + 生成 Assist/Auto（仍无 MCP）
- [x] Agent 会话：按项目存在服务端（`project_chat`，不进快照）；同一会话多轮上下文。无 MCP。界面偏好仍留本机

## Phase 18 — 摄像机 / 选区历史 / 视频首尾帧

- [x] 摄像机控制写入图/视频 prompt
- [x] 撤销重做恢复选区
- [x] 视频首/尾帧槽位 + first_last 参考序

## Phase 19 — 图片组叠卡

- [x] 多图结果自动成组；折叠叠卡 / 展开网格；设为主图

## Phase 20 — TTS 语音生成（MVP）

- [x] `kind:audio` Job + OpenAI-compatible `/audio/speech`
- [x] 画布音频节点：文本 → 语音（音色 / 格式 / 语速）
- [ ] 全量 TTS 供应商面板（Gemini / MiMo / Grok / GLM…）— 明确不做

## Phase 21 — AI 工具箱（MVP）

- [x] `/tools` 目录 + `/tools/[slug]` 详情；侧栏入口
- [x] 工具目录：拍立得 / 公仔 / 杂志 / Logo / 线稿上色 / 贴纸 / 像素 / 海报等，走 `POST /jobs` + `tool-catalog.ts`（新工具只加目录项）
- [x] 工具详情：左侧栏表单 + 底部生成 + 右侧预览；控件用 JoyAI 模型/参数组件；目录卡本地封面叠层
- [x] 接吻 / 拥抱视频（`ai-kiss` / `ai-hug`，走 image→video Job，目录已 `available`）
- [ ] 高清放大 `upscale`（目录 `coming_soon`；需独立 job kind + 供应商，禁止用图生图提示词冒充）

## Phase 22 — 部署与任务可靠性（2026-09-22）

- [x] 单镜像内 nginx：`:3000` 反代 Next + Nest，`/socket.io` 带 WebSocket Upgrade（飞牛外层只需 HTTPS→18080）
- [x] 共享 `useJobLifecycle`：Socket 推送 + `GET /jobs/:id` 对账；创作 / 画布 / 漫剧 / 工具 / 历史 / 资产统一接入
- [x] Socket 优先 polling，不依赖飞牛单独开 WS
- [x] MySQL / TypeORM UTC：`timezone: Z`、连接 `SET time_zone=+00:00`、`CURRENT_TIMESTAMP(3)` 列（会话 UTC 下等价于墙钟无关）；compose `--default-time-zone=+00:00`
- [x] 资产详情弹框参考素材支持视频封面（及音频占位）
- [x] 画布全景节点空态去掉硬编码深色底，与浅色卡片一致

## 下一步（未排期）

- [ ] Admin 仓储 GC 页面（API 已有 `GET/POST /admin/storage/gc`）
- [ ] 审计日志后台浏览（实体已有）
- [ ] 最小自动化测试（shared / job lifecycle / jobs 冒烟）
- [ ] 生产 TypeORM migration（逐步摆脱纯 synchronize）

## 本地启动（需自行安装依赖）

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm build:packages
pnpm dev:server
pnpm dev:web
```

填写 `.env` 中 `ARK_*` 与 `TOS_*` 后，以 admin 角色登录 web 访问 `/admin` 可补渠道/模型，或依赖 bootstrap 自动建渠道。

飞牛部署：先起 `deploy/fnos/db`，再起 `deploy/fnos/app`（拉 `liuxiaodi2026/joyai:latest`）。改过 MySQL 时区后需按新 compose **重启 db**，之后新任务时间按 UTC 存、本地正确显示。不做历史行校正。
