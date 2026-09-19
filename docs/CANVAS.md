# Canvas — 无限画板参考源与规格

本文定义 JoyAI 无限画板的**正式参考源**、与竞品的能力差距，以及 Phase 4 MVP 之后的演进规格。  
实现约束仍服从 `.cursor/skills/joyai-engineering/SKILL.md` 与 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 原则

1. **产品是「AIGC 生成卡片画板」**，不是手绘白板，也不是完整 Comfy 流水线。
2. **`ai-comic-drama` / `ai-video` 不是画板参考源**：仅允许对照业务能力与踩坑；禁止整模块/整页/Entity 搬运。其实现乱、缺小地图与节点小工具等，**不得**作为交互或代码范式。
3. **体验对标公开 AIGC 节点画布竞品**；**基建可对照开源引擎**；业务与品牌自研。
4. Board = pan/zoom + React 绝对定位节点 + Zustand；Fabric **仅**图片节点内编辑；快照只存 `assetId` / URL，禁止 base64。

## 2. 参考源分层

| 层 | 用途 | 该看什么 | 明确不做 |
|----|------|----------|----------|
| A. 产品 UX | 交互范式、chrome、节点体验 | Flora、Weavy / Figma Weave、Krea、Floyo、LibTV、即梦智能画布 | 抄 UI 皮肤或闭源实现 |
| B. 开源实现 | MiniMap、多选、NodeToolbar、edges、registry、创建/连线 UX | `@xyflow/react`、[basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)、open-storyboard-canvas、caraca、flowcraft、franklin-canvas | 整仓粘贴；默认换栈；不搬 Ant Design / 插件 / Agent |
| C. 白板 SDK | 视口、选区、undo 心智 | Excalidraw（MIT）；tldraw（商用需授权） | 当作 JoyAI 主路径 |
| 0. 旧仓踩坑 | Seedream/Seedance、队列、TOS、快照体积 | `ai-comic-drama`、`ai-video` | 当竞品标杆或代码源 |

### 2.1 A 层 — 产品竞品（体验）

| 产品 | 学什么 | 不学什么（首期） |
|------|--------|------------------|
| **Flora** | 多模态节点、连线语义、批量参数、画布内编辑入口 | 全模型聚合、PDF/复杂合成 |
| **Weavy / Figma Weave** | 专业向管线感、可复用步骤 | 设计系统深度绑定 |
| **Krea** | 探索流、低延迟反馈心智 | 实时 LCM 全栈 |
| **Floyo** | 节点工作流 chrome、队列/运行态 | Comfy 全量导入（VISION 明确不做） |
| **LibTV** | 国内「无限画布 + 节点工作流」叙事；文/图/视频节点编排 | 剧本→成片长链路、Agent 全自动 |
| **即梦智能画布** | 多图融合、局部重绘、扩图等「改图画布」动作 | 单次出片工具定位替代节点编排 |

### 2.2 B 层 — 开源仓（可读代码）

| 仓库 | 栈/定位 | 优先对照 |
|------|---------|----------|
| [xyflow/xyflow](https://github.com/xyflow/xyflow)（`@xyflow/react`） | 节点图引擎 MIT | MiniMap、Controls、Background、NodeToolbar、框选、edges、viewport API |
| [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) | Vite + Zustand 自研无限画布（MIT） | 右键/连线落空创建菜单、系统剪贴板、网格模式、浮层 no-zoom、hover 工具条、结果落点；**不**引入其插件/Agent/IndexedDB/Ant 皮 |
| [ganbo-gab/open-storyboard-canvas](https://github.com/ganbo-gab/open-storyboard-canvas) | Tauri + React 分镜/导演台 | 节点类型划分、参考素材、`@` 引用、几何索引/性能 |
| [CPloscaru/caraca](https://github.com/CPloscaru/caraca) | Next + xyflow + fal | 与 JoyAI 栈接近的节点生图/生视频编排 |
| [mblanc/flowcraft](https://github.com/mblanc/flowcraft) | Next + xyflow + Gemini/Veo | 依赖执行、节点运行态、配置面板 |
| [BlockRunAI/franklin-canvas](https://github.com/BlockRunAI/franklin-canvas) | 节点媒体制作 | 底栏 zoom / Fit / 网格 / 小地图 chrome |

对照方式：**只提炼交互、数据结构与能力清单，用本仓栈重写**。是否引入 `@xyflow/react` 见 §5，属架构决策，非默认动作。

### 2.3 C 层 — 白板（辅助）

- **Excalidraw**：MIT，可嵌入；借 pan/zoom/选区心智，不借手绘业务。
- **tldraw**：能力强，生产嵌入需商用授权；默认不当依赖。
- **Quickdraw 等 MIT 白板**：仅作轻量 SDK 备选调研，非 AIGC 节点标杆。

## 3. 现状（Phase 4 MVP 已收口）

代码位置：`apps/web/src/features/canvas/`；契约：`packages/shared` 的 `CanvasSnapshot` / `CanvasNodeType`。

| 能力 | 状态 | 说明 |
|------|------|------|
| pan / zoom、节点 CRUD | 有 | text / image / prompt / video |
| 自动保存快照 | 有 | ~1s 防抖；节点引用 Asset |
| 触发生成 + 结果回写 | 有 | Job → Socket / `patchNodeAsset` |
| Fabric 图片内编辑入口 | 有 | 非整页引擎；导出与 asset 闭环仍需加固 |
| 底栏 / 小地图 | 有 | 拖跳视口、开关 localStorage 记忆、多节点简化绘制 |
| 选中节点浮动工具条 | 有 | 按类型 registry 驱动；支持多选批量 |
| 撤销重做、适应屏幕、右键加节点 | 有 | |
| 画板框选多选 | **有** | 框选 + Shift；多选批量复制/删除 |
| 节点连线 / handles | **有** | Snapshot v2 edges；绿点拖出连线 |
| 统一 node registry | **有** | `node-registry.ts` + `node-view.tsx` |
| 组 / 对齐 / 批量改参 | **有（对齐/成组）** | 多选工具条；`groupId` 存 node.data |
| 扩图 / 局部重绘 | **有（Job）** | image Toolbar → prompt `operation` + 参考图 |

## 4. 竞品能力差距（相对 Flora / LibTV / xyflow 级体验）

| 能力域 | 竞品常见 | JoyAI 现状 | 下一阶段态度 |
|--------|----------|------------|--------------|
| 视口 chrome | zoom%、Fit、网格、小地图可拖跳 | 有基础 dock + minimap | **必做增强** |
| 选择模型 | 单击 / 框选 / Shift 加选 / 多选工具条 | 单选为主 | **必做** |
| 节点小工具 | NodeToolbar：按类型动作、生成、引用、下载 | 浮动条雏形 | **必做增强** |
| 节点连线 | prompt→image→video 数据流可视化 | Snapshot v2 edges + handles | **已做** |
| 运行态 | 节点上进度/失败/重试 | 节点级 badge + toolbar | **已做** |
| 改图动作 | 局部重绘、扩图、消除（即梦向） | outpaint/inpaint Job + Fabric 编辑 | **已做（Job 级）** |
| 工作流模板 | Flows / 可复用管线 | 无 | **不做（首期外）** |
| Comfy 导入 | Floyo 等 | 无 | **明确不做**（VISION） |

## 5. 技术选型备忘

| 选项 | 结论 |
|------|------|
| 继续自研 absolute nodes + Zustand | **默认路径**；与现有快照、Job 回写一致 |
| 引入 `@xyflow/react` | **仅当**框选/连线/MiniMap/Toolbar 自研成本明显高于集成，且能保住「快照只存 asset 引用」与节点业务组件边界时再议 |
| 换 Excalidraw / tldraw 做整板 | **否**；形态是白板/手绘，不是生成卡片 |
| 从 `ai-comic-drama` 搬 Canvas 页 | **否** |

## 6. 下一阶段规格（建议 Phase 6 — 画板体验）

目标：在不引入 Comfy/长链路的前提下，把画板 chrome 与节点交互拉到「可日常创作」水位。  
验收以本表为准；实现仍走本仓栈重写。

### 6.1 P0 — 必做

- [x] **选择模型**：框选、Shift 加/减选、Delete 批量删、多选时统一浮动动作（复制/删除）
- [x] **NodeToolbar 按类型**：image（编辑/上传/下载/作参考）、prompt（清空/重试）、video（上传/下载）、text（文案生图）
- [x] **小地图增强**：视口框拖拽跳转、缩放联动、开关记忆、大量节点时简化绘制
- [x] **node registry**：`type → { defaultData, toolbar, size }` + `NodeView` 组件映射
- [x] **节点运行态**：生成中/失败/可重试展示在节点或 toolbar
- [x] **Fabric 应用结果**：导出后上传 Asset，快照只写 `assetId`/URL（并剥离误入的 data URL）

### 6.2 P1 — 应做

- [x] 对齐/轻微吸附（或网格吸附开关）
- [x] 画布快捷键表（与 dock 一致）：空格平移、⌘/Ctrl±、0 适应、⌘Z/⇧⌘Z、?
- [x] prompt `@` 引用与选中图片节点的双向可见性（高亮被引用节点）
- [x] 项目内「定位到节点」（从失败 Job / 资产跳回）

### 6.3 P2 — 可选（单独立项）

- [x] edges / handles（显式 prompt→image→video）；`CanvasSnapshot` v2 + `normalizeCanvasSnapshot`
- [x] 即梦向改图动作（扩图/局部重绘）作为 image 工具，仍走异步 Job（`operation` + 参考图）
- [x] 是否评估 `@xyflow/react` 替换自研视口层 → [ADR-001-xyflow.md](./ADR-001-xyflow.md)：**现阶段不引入**

### 6.4 本阶段不做

- 小说分镜长链路、Hub 同步、Comfy 导入、制作大片流水线、计费会员、完整多人实时协作 CRDT

### 6.5 Phase 7 — 对齐 / 成组

- [x] 多选对齐与分布（≥2 对齐，≥3 分布）
- [x] 轻量成组：`groupId` 写入 `node.data`（不升 snapshot 版本）；选中/拖动整组；虚线包围框

### 6.6 Phase 8 — 交互打磨（参考 infinite-canvas，本仓栈重写）

主题与 chrome 跟全局 light/dark tokens；创建入口为**右键**（不做双击空白）。

- [x] Canvas chrome 换肤（`canvas-chrome.css`）：dock / toolbar / menus / minimap / top bar
- [x] 空白右键创建菜单（图标 + 上传）；节点右键复制 / 删除 / 成组·解组
- [x] 绿点拖到空白 → 创建菜单并自动连线（从图/文拖出优先推荐 prompt）
- [x] 内部剪贴板带 edges；空时回退系统剪贴板图/文
- [x] 网格 `dots | lines | blank`（localStorage）；`data-canvas-no-zoom` / `data-canvas-shortcuts-ignore`
- [x] 单选工具条：选中常驻，未选中 hover 短暂显示
- [x] 生成结果写回已有空 image 出边；重试带上 reference；连线创建 prompt 预填参考
- [x] 多选虚线包围框；媒体节点画框化；Space 临时切换工具 + blur 释放；粘贴落视口中心；菜单边缘夹紧；拖动时隐藏工具条；节点标题 chip；dock 缩放滑条

### 6.7 Phase 9 — 对照 infinite-canvas 补齐创作能力

仍走自研 absolute nodes + Zustand（不引入 `@xyflow/react` / 白板 SDK / Agent / IndexedDB）。

- [x] **四角缩放**：选中节点拖角改 `width`/`height`（图/视频默认锁比例，Shift 自由）；写入 snapshot
- [x] **节点下方生成面板**：选中已有媒体的图/视频节点，可生图或生视频（参考图走 Job）；工具条可收起
- [x] **Prompt 输出类型**：图像 / 视频切换；视频结果落空 video 出边或新建 video 节点
- [x] **图生视频**：图像工具条旁路创建 `outputKind: video` 的 prompt
- [x] **视频截帧**：工具条当前帧 + 右键首/当前/尾帧 → 上传 Asset → 新建 image 节点并连线

### 6.8 Phase 10 — 全景 / 导演台 / 音频

- [x] **`CanvasNodeType`**：`panorama` / `audio` / `director`（shared 契约 + registry）
- [x] **全景节点**：2:1 上传识别、three.js 等距环视（选中/悬停最多 3 路预览，全屏环视独占 WebGL）、加载失败提示、截当前视角落图像节点、关闭环视记住视角；生成/拖入/转换后探测非 2:1 并提示；下方面板包 `wrapPanoramaPrompt` + ratio `2:1` 生图
- [x] **导演台**：连入全景/图像 → 全屏环视 → 截当前视角上传 Asset → 新建 image 节点并连回
- [x] **音频节点**：上传 / 原生播放；底栏与右键菜单可创建；拖入 audio 文件

### 6.8b Phase 16 — 3D 导演台（three.js SPA）

对照 infinite-canvas：用正式 three.js 导演台静态页（`public/director`），不自研 WebGL 舞台；画布侧只做 postMessage 桥接与 Asset 落点。

- [x] **依赖**：`apps/web` 安装 `three`（导演台 SPA 内置 three 运行时）
- [x] **空开**：`/director/index.html` 打开即可用，不必先连线
- [x] **可选输入**：连入的全景 / 图像经 `storyai:director-panoramas` 注入；移除时断开画布边
- [x] **输出**：截图 / 视频经上传 Asset 落到画布节点；`directorProject` 只存 JSON，截图 data URL 不进快照

### 6.9 Phase 11 — 图像本地改图

对照 infinite-canvas 的裁剪 / 切图 / 放大，用本仓栈重写（不引入 Ant Design，不做 AI 超分 / 多角度 / 反推）。

- [x] **裁剪**：选区 + 常用比例 → 上传 Asset → 右侧新图像节点并连线
- [x] **切图**：按行列均分（最多 6×6）→ 多张图像节点网格落点
- [x] **放大**：1K / 2K / 4K 本地插值（高清 / 双线性 / 最近邻），不是模型超分
- [x] **查看大图**、复制连入提示词、自由比例开关（写入 `node.data.freeResize`；Shift 临时反向）
- [x] 入口：图像/全景工具条「改图」菜单 + 节点右键

### 6.10 Phase 12 — 信息 / 字号 / 截取 / 涂抹

对照 infinite-canvas 的节点信息、文本字号、音频截取和局部遮罩，用本仓栈重写（分离音频可用 mediabunny；不引入 Ant Design，不做 AI 超分）。

- [x] **节点信息**：单选工具条与右键可看类型、尺寸、状态、文案；JSON 视图省略 data URL
- [x] **文本字号**：工具条放大 / 缩小，写入 `node.data.fontSize`（10–32）
- [x] **截取音频**：音/视频选区试听 → 解码为 WAV（失败则窗口抽音）→ 上传 Asset → 新音频节点并连线
- [x] **局部涂抹**：画笔 / 擦除标出区域 → 合成标记图上传 → 标记图 + 局部重绘提示词节点并自动提交 inpaint Job

### 6.11 Phase 13 — 连线命中 / 参考条

对照 infinite-canvas 的参考条，只做连线相关的可见与可断开，不引入选择模式、Ant Design。

- [x] **连线可见**：浅色主题用 `currentColor`，不再用近白描边；命中层覆盖节点包围盒，点线可选中后 Delete
- [x] **落到最上层节点**：拖线松手按绘制顺序从后往前命中，重叠时不再连到下面那张
- [x] **提示词参考条**：连入的图 / 视频 / 音频 / 文本显示缩略条，悬停可断开该边
- [x] 框选、适应画布、小地图、对齐、聚焦使用同一套节点默认尺寸

### 6.12 Phase 14 — 叠放 / 微调 / 拖入编组

- [x] **叠放**：右键与多选工具条可置于顶层 / 底层；`[` `]` 上下一层，Ctrl/Cmd 组合直接到底或到顶。点选编组时成员一起移动
- [x] **方向键**：未吸附时 1px（Shift 10px），吸附时按网格（Shift 两格）。按住只记一次撤销
- [x] **拖入编组**：把未入组节点拖到已有编组范围内即加入。Alt 拖动只移动当前节点，离开原组范围则移出

### 6.13 Phase 15 — 复制 / 视口 / 高度

- [x] **复制**：副本不再带上进行中的 `jobId`，避免一次生成写出两张结果；单张复制脱离原组，多张同组复制变成新组；选中节点之间的连线一并复制
- [x] **视口**：滚轮、拖动、平移、框选读取当前缩放，触控板连续滚动不再停在旧倍率
- [x] **结果落点**：生成完成不抢走当前选中，并可撤销；文本 / 提示词卡片高度写回节点，连线锚点跟着内容
- [x] **适应选中**：按 `1` 把选中节点收入视口（没有选中时等同适应全部）

**本阶段明确不做：** 插件 / URL 装节点、本地 Canvas Agent / MCP、Ant Design 皮、IndexedDB 本地项目模型、TTS 全量供应商面板、AI 超分 / 多角度、换 `@xyflow/react`。

## 7. 文档与工程入口

| 文件 | 关系 |
|------|------|
| [VISION.md](./VISION.md) | 产品边界；旧仓禁止拿来主义 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 快照与 Fabric 边界 |
| [TODO.md](./TODO.md) | Phase 6 勾选落地 |
| [NOTES.md](./NOTES.md) | 快照体积、自动保存、对照方式 |
| `.cursor/skills/joyai-engineering` | 日常编码硬规则 |

更新本文件时：改参考链接或 P0/P1 范围须同步 TODO；禁止把闭源竞品实现细节写成可复制伪代码。
