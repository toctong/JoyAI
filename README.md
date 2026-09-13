# JoyAI

AIGC 创意平台：对话式生图/生视频 + 无限画板。后端 NestJS（Fastify）+ Prisma + BullMQ；前端 Next.js + shadcn/ui；首期接入火山引擎 Ark（Seedream / Seedance）与 TOS。

## 文档

先读 [docs/README.md](docs/README.md)，进度见 [docs/TODO.md](docs/TODO.md) / [docs/DONE.md](docs/DONE.md)。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env：DATABASE_URL / REDIS_URL / JWT_SECRET / ARK_* / TOS_*

# Prisma 只读 apps/server/.env，根目录 .env 要再拷一份：
cp .env apps/server/.env

docker compose up -d
pnpm install
pnpm build:packages
pnpm db:generate
pnpm db:push
pnpm dev:server   # :3001  Swagger → /api/docs
pnpm dev:web      # :3000
pnpm dev:admin    # :3002
```

默认管理员：`admin` / `admin123`（`AUTH_BOOTSTRAP_*` 可改）。

## 约束

旧项目（ai-video / ai-comic-drama）只作能力与踩坑参考，禁止整包搬运。无限画板正式参考源与下一阶段规格见 [docs/CANVAS.md](docs/CANVAS.md)；另见 `docs/NOTES.md` 与 `.cursor/skills/joyai-engineering`。
