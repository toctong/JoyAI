# Vision

## 产品

FrameRally 是 AIGC 创意工坊：创作者用对话式首页生成图片/视频，用无限画板组织素材与生成卡片；运维 UI 合入 `apps/web` 的 `/admin`（admin 角色门禁），不再单独打包 `apps/admin`。

产品可参考公开 AIGC 产品的能力范式（对话生图、无限画板节点），体验与品牌按 FrameRally 自研。

无限画板的**正式参考源、竞品差距与 Phase 6 规格**见 [CANVAS.md](./CANVAS.md)。  
`ai-comic-drama` **不是**画板交互/实现标杆（初版乱、缺小地图与节点小工具等）。

## 当前产品面

- 登录 / JWT；灵感、探索、创作、画布、漫剧、资产、工具（侧栏顺序固定，工具在资产下面）
- 异步生图 / 生视频 / 语音（`POST /jobs` + BullMQ）
- AI 工具箱：目录配置驱动，不按工具复制页面
- 无限画板（图像 / 文本 / 提示词 / 视频 / 音频 / 全景 / 导演台截图落资产）
- 渠道适配：OpenAI-compatible、DashScope、火山 Ark + TOS
- 运维 UI（`apps/web` `/admin`：渠道、模型、用户、任务；role gate）
- 视觉：`design-tokens.css` 的 `--joy-*` 为尺度来源；壳层用 `bg-card`，避免和 `bg-background` 接出一条色差

## 明确不做

小说分镜长链路、Hub 同步、Comfy 导入、制作大片流水线、完整 RBAC 菜单树、计费会员。

## 对旧项目：禁止拿来主义

`ai-video`、`ai-comic-drama` **只作能力与踩坑参考**（非画板竞品源）：

- 禁止复制整模块 / 整页业务 UI / TypeORM Entity / 巨石 Provider
- 禁止 symlink 旧 apps
- 允许对照理解 Seedream/Seedance、队列拆分、TOS、节点快照后，用本仓栈重写
- 画板体验请对照 [CANVAS.md](./CANVAS.md) 中的 Flora / LibTV / xyflow 等分层参考
