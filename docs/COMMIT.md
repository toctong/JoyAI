# FrameRally commit convention

Conventional Commits, enforced by **husky** `commit-msg` + **commitlint**.

## Format

```
type(scope): subject
```

Optional body after a blank line.

| Part | Language | Rules |
|------|----------|--------|
| `type` | English | from the enum below |
| `scope` | English kebab-case | product / package area |
| `subject` | **中文（推荐）** | 简述改动目的；无句号结尾；≤100 字符 |

`type` / `scope` 必须英文，便于工具与筛选；**subject 明确推荐中文**，方便团队扫日志。

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
fix(inspire): 修复漫游取消静音立刻又静音
refactor(explore): Plyr 视频改到 React 外挂载避免 removeChild
chore: 接入 commitlint 与 husky 提交校验
```

英文 subject 仍可通过校验，但新提交请优先用中文。

侧边栏 **Generate Commit Message**（魔法棒）默认不读 `.cursor/rules`；仓库根目录 `.cursorrules` 会传入该生成流程，用来强制中文 subject。Agent 聊天里代写 commit 则遵循 `.cursor/rules/git-commit.mdc`。

### Not allowed

- 无 type 的随意文案（`更新样式`、`wip`、`fix bug`）
- 整行全中文且无 `type(scope):` 前缀
- subject 以英文句号 `.` 结尾
- 提交密钥 / `.env`

## Local setup

```bash
pnpm install   # runs `prepare` → husky
```

Hooks:

| hook | check |
|------|--------|
| `pre-commit` | 暂存区含 `.ts`/`.tsx` 时跑 `pnpm typecheck`（先 build packages，再各包 `tsc --noEmit`） |
| `commit-msg` | `commitlint` 校验提交文案 |

Manual:

```bash
pnpm typecheck
echo "feat(inspire): 作品详情全屏弹层" | pnpm exec commitlint
```

若 Windows 上出现 `env: unknown option -- version/_/pre-commit`，多半是 `core.hooksPath` 被写坏。修复：

```bash
git config core.hooksPath .husky/_
```
