---
name: joyai-engineering
description: >-
  JoyAI monorepo engineering standards for Next.js shadcn apps, Nest Fastify
  server, shared types, ai-providers, BullMQ jobs, and infinite canvas.
  Use when writing or reviewing any JoyAI code, adding modules, UI, or providers.
---

# JoyAI Engineering

## Hard rules

1. **No 拿来主义 from old repos** (`ai-video`, `ai-comic-drama`): read for reference only; rewrite with this stack. Never paste whole modules/pages/entities.
2. **Business code never hardcodes provider URLs** — use `@joyai/ai-providers`.
3. **Generation is always async** via BullMQ; HTTP returns job id immediately.
4. **Canvas snapshots** store `assetId`/URL only — no base64 blobs.

## Frontend layout (`apps/web`)

```
src/
  app/                 # Next App Router
  components/ui/       # shadcn only
  features/<domain>/   # feature UI + hooks
  entities/<domain>/   # types thin wrappers if needed
  shared/lib/          # api client, utils
  shared/stores/       # zustand
```

- Prefer Server Components; mark `"use client"` only when needed.
- Forms: react-hook-form + zod (schemas from `@joyai/shared` when shared).
- UI: official shadcn + Radix under `components/ui/` (`components.json` configured). Prefer `npx shadcn@latest add <name>`; do not hand-roll Radix-less fakes.
- Theme: `next-themes` light / dark / system; tokens in `globals.css` (`:root` + `.dark`).
- Web IA: left icon rail — 灵感 `/inspire` · 创作 `/studio` · 画布 `/canvas` · 资产 `/assets`.
- Ops UI lives under `/admin` (role `admin` only); no separate `apps/admin`.
- Imports: external → `@joyai/*` → `@/` aliases; no deep relative `../../../`.

## Backend layout (`apps/server`)

```
src/
  modules/<domain>/    # module, controller, service, dto
  common/              # guards, filters, prisma
  config/
```

- DTO: class-validator + Swagger decorators.
- One domain per module; jobs workers live under `modules/jobs`.
- Prisma access via `PrismaService` only.

## Packages

- `@joyai/shared`: zod schemas, job kinds, canvas node types, API contracts.
- `@joyai/ai-providers`: `ImageProvider` / `VideoProvider` interfaces + `volcengine` adapter.

## Canvas

- Board = pan/zoom + React absolute nodes + Zustand (+ edges in snapshot v2).
- Fabric = **inside** image-node editors only.
- Node registry: type → component + default data factory.
- Formal refs / competitor gaps / Phase 6: `docs/CANVAS.md` (not `ai-comic-drama`).
- Do not introduce `@xyflow/react` without revising `docs/ADR-001-xyflow.md` (currently deferred).
- Do not treat whiteboard SDKs (tldraw/Excalidraw) as the product path.

## Naming

- Files: `kebab-case.ts` / `PascalCase.tsx` for components.
- DB: Prisma `PascalCase` models, `camelCase` fields.
- Queues: `image-generation`, `video-submit`, `video-poll`.
