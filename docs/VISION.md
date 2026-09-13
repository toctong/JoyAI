# Vision

## 产品

JoyAI 是 AIGC 创意工坊：创作者用对话式首页生成图片/视频，用无限画板组织素材与生成卡片；运维用轻量 Admin 配置渠道与模型。

产品可参考公开 AIGC 产品的能力范式（对话生图、无限画板节点），体验与品牌按 JoyAI 自研。

无限画板的**正式参考源、竞品差距与 Phase 6 规格**见 [CANVAS.md](./CANVAS.md)。  
`ai-comic-drama` **不是**画板交互/实现标杆（初版乱、缺小地图与节点小工具等）。

## 首期范围

- 登录 / JWT
- 首页生图、生视频（异步任务）
- 资产与历史
- 无限画板 MVP（image / text / prompt / video 节点）
- 火山 Ark + TOS
- 轻量 Admin（渠道、模型、用户、任务）

## 明确不做（首期）

小说分镜长链路、Hub 同步、Comfy 导入、制作大片流水线、完整 RBAC 菜单树、计费会员。

## 对旧项目：禁止拿来主义

`ai-video`、`ai-comic-drama` **只作能力与踩坑参考**（非画板竞品源）：

- 禁止复制整模块 / 整页业务 UI / TypeORM Entity / 巨石 Provider
- 禁止 symlink 旧 apps
- 允许对照理解 Seedream/Seedance、队列拆分、TOS、节点快照后，用本仓栈重写
- 画板体验请对照 [CANVAS.md](./CANVAS.md) 中的 Flora / LibTV / xyflow 等分层参考
