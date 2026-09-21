# JoyAI

AIGC 创意平台：对话式生图/生视频 + 无限画板。后端 NestJS（Fastify）+ TypeORM（MySQL）+ BullMQ；前端 Next.js + shadcn/ui；首期接入火山引擎 Ark（Seedream / Seedance）与 TOS。

## 文档

先读 [docs/README.md](docs/README.md)，进度见 [docs/TODO.md](docs/TODO.md) / [docs/DONE.md](docs/DONE.md)。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env：REDIS_URL / JWT_SECRET / ARK_* / TOS_*（数据库 DATABASE_URL，默认本机 MySQL joyai）

# 服务端也会读 apps/server/.env，根目录 .env 建议再拷一份：
cp .env apps/server/.env

docker compose up -d   # Redis + MySQL
pnpm install
pnpm build:packages
pnpm dev:server   # :3001  Swagger → /api/docs；健康检查 → /api/health
pnpm dev:web      # :3000（管理后台在 /admin）
```

默认管理员：`admin` / `admin123`（`AUTH_BOOTSTRAP_*` 可改）；登录后访问 `/admin`。

清空本地库：`pnpm db:reset` 后重启 `dev:server`（表会按实体重建，并重新 bootstrap 管理员）。若还留着旧的 `apps/server/data/sql.db`，可在空库上执行一次 `pnpm --filter @joyai/server db:import-sqlite`。

服务端插件形态：TypeORM + `@dataui/crud-typeorm`（`TypeOrmCrudService`）+ `@nestjs/mapped-types` / Swagger `PartialType` + `@nestjs/terminus`。

## 约束

旧项目（ai-video / ai-comic-drama）只作能力与踩坑参考，禁止整包搬运。无限画板正式参考源与下一阶段规格见 [docs/CANVAS.md](docs/CANVAS.md)；另见 `docs/NOTES.md` 与 `.cursor/skills/joyai-engineering`。
