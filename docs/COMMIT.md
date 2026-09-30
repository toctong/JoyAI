# FrameRally commit convention

Conventional Commits, enforced by **husky** `commit-msg` + **commitlint**.

## Format

```
type(scope): subject

- 改动点一
- 改动点二
```

| Part | Language | Rules |
|------|----------|--------|
| `type` | English | from the enum below |
| `scope` | English kebab-case | product / package area |
| `subject` | **中文（推荐）** | 简述改动目的；无句号结尾；≤100 字符 |
| **body** | **中文** | **必填**：空一行后用 `- ` 列表写全本次改动，一条一点 |

`type` / `scope` 必须英文，便于工具与筛选；**subject 与 body 明确推荐中文**，方便团队扫日志。

### Body（必填）

- 标题与正文之间必须空一行
- 每条以 `- `（或 `* `）开头，说明**具体改了什么**（列全，不要只写笼统总结）
- 用中文短句；可写组件 / 文件 / 行为，避免英文堆砌
- 极小的单点修改也至少写 **1** 条 bullet

### Types

| type | use for |
|------|---------|
| `feat` | 新功能 / 用户可见能力 |
| `fix` | 缺陷修复 |
| `refactor` | 重构（行为不变） |
| `perf` | 性能 |
| `style` | 纯格式 / CSS 微调（非产品「风格」） |
| `docs` | 仅文档 |
| `test` | 仅测试 |
| `build` | 构建 / 打包 / 依赖封装 |
| `ci` | CI 配置 |
| `chore` | 工具链、杂务 |
| `revert` | 回滚某次提交 |

### Scopes (kebab-case)

Prefer a product / package area, e.g. `inspire`, `explore`, `studio`, `canvas`, `manju`, `assets`, `tools`, `auth`, `server`, `web`, `shared`, `ai-providers`, `jobs`, `admin`.

Scope is recommended for app changes; omit only for truly repo-wide chores.

### Examples（推荐写法）

```
feat(inspire): 作品详情改为全屏弹层

- AppHeader 增加 hideCluster，画布/漫剧工作台隐藏次要入口
- 布局传入 hideCluster，统一最小顶栏
- 调整 CSS，匹配精简顶栏态
```

```
fix(inspire): 修复漫游取消静音立刻又静音

- 取消 mute 时同步写回 store，避免下一次 tick 盖回
```

```
chore: 接入 commitlint 与 husky 提交校验

- 增加 commitlint 配置与 commit-msg hook
- 文档补充中文 subject 与 body 列表约定
```

英文 subject 仍可能通过校验，但新提交请优先用中文；**body 列表与空行由 commitlint 强制**。

侧边栏 **Generate Commit Message**（魔法棒）默认不读 `.cursor/rules`；仓库根目录 `.cursorrules` 会传入该生成流程。Agent 聊天里代写 commit 则遵循 `.cursor/rules/git-commit.mdc`。

### Not allowed

- 无 type 的随意文案（`更新样式`、`wip`、`fix bug`）
- 整行全中文且无 `type(scope):` 前缀
- subject 以英文句号 `.` 结尾
- **只有标题、没有 body 列表**
- body 里只有散文、没有 `- ` / `* ` 条目
- 提交密钥 / `.env`

## Local setup

```bash
pnpm install   # runs `prepare` → husky
```

Hooks:

| hook | check |
|------|--------|
| `pre-commit` | 暂存区含 `.ts`/`.tsx` 时跑 `pnpm typecheck`（先 build packages，再各包 `tsc --noEmit`） |
| `commit-msg` | `commitlint` 校验文案（含 body 列表） |

Manual:

```bash
pnpm typecheck
printf '%s\n' 'feat(inspire): 作品详情全屏弹层' '' '- 详情改为全屏 Dialog' | pnpm exec commitlint
```

若 Windows 上出现 `env: unknown option -- version/_/pre-commit`，多半是 `core.hooksPath` 被写坏。修复：

```bash
git config core.hooksPath .husky/_
```
