# ADR-001 — 是否引入 `@xyflow/react` 作为画板视口层

- **状态**：已采纳（延期引入）
- **日期**：2026-09-13
- **关联**：[CANVAS.md](./CANVAS.md) §5 / Phase 6 P2

## 背景

FrameRally 画板是自研 `pan/zoom + React 绝对节点 + Zustand`，已完成 P0/P1（多选、小地图、NodeToolbar、吸附、@ 高亮、定位）。  
P2 需要显式 edges/handles。业界常用 `@xyflow/react`（React Flow）提供 MiniMap、框选、连线、NodeToolbar 等开箱能力，需书面决定是否换栈。

## 选项

| 选项 | 说明 |
|------|------|
| A. 全面替换为 `@xyflow/react` | 视口、节点拖拽、edges、MiniMap 均交给库 |
| B. 继续自研，自写 edges/handles | 保持现有快照与 Job 回写路径 |
| C. 混合：仅 edges 用 xyflow，外层仍自研 | 双套视口模型，复杂度最高 |

## 决策

**选 B：现阶段不引入 `@xyflow/react`。**  
用自研 edges（`CanvasSnapshot` v2）补齐连线；未来仅当 edges/性能/协作成本显著高于自研时，再开新 ADR 评估迁移。

## 理由

1. **产品形态是生成卡片画板**，不是通用流程图；xyflow 的强项（多 handle 类型、执行图）首期用不上。
2. **快照契约已落地**（只存 `assetId`/URL、Socket `patchNodeAsset`、Zustand undo）；换栈要重写视口与序列化，收益不抵风险。
3. **许可与体积**：xyflow MIT 可用，但引入后与现有 MiniMap/框选/Toolbar 重复，短期增加包体积与心智负担。
4. **P0/P1 已自研到位**；P2 edges 可用 SVG + handle 拖拽在现有变换层上完成。

## 后果

- 工程 skill / CANVAS §5 维持「默认自研；xyflow 仅书面评估后再议」。
- 允许对照 xyflow 的交互（handle 位置、贝塞尔边、选中边删除），禁止整包粘贴。
- 若出现：多人实时协作、复杂多端口执行图、节点数 >~2k 性能瓶颈，再启动 ADR-001 修订。

## 不做

- 本期不安装 `@xyflow/react` / `reactflow`。
- 不把 Excalidraw / tldraw 当画板主路径（见 CANVAS）。
