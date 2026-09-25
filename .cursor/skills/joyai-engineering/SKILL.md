---
name: joyai-engineering
description: >-
  FrameRally monorepo engineering and visual standards for Next.js shadcn apps,
  Nest Fastify server, shared types, ai-providers, BullMQ jobs, AI tools,
  and infinite canvas. Use when writing or reviewing any FrameRally code, adding
  modules, UI, tools, or providers.
---

# FrameRally Engineering

## Hard rules

1. **No 拿来主义 from old repos** (`ai-video`, `ai-comic-drama`): read for reference only; rewrite with this stack. Never paste whole modules/pages/entities. Public GitHub / PixAI-like tools are prompt-and-UX references only — new tools are catalog entries, not copied apps.
2. **Business code never hardcodes provider URLs** — use `@joyai/ai-providers` (OpenAI-compatible, DashScope, Volcengine). Do not add a one-off fetch to a vendor in a feature.
3. **Generation is always async** via BullMQ; HTTP returns job id immediately. Image, video, audio, and AI tools all go through `POST /jobs`.
4. **Canvas snapshots** store `assetId`/URL only — no base64 blobs. Agent chat for a canvas project lives in `project_chat`, not inside the snapshot.
5. **Product scopes stay separate.** Studio / canvas / manju / AI tools each query their own jobs (`scope=studio|canvas|manju|tools`). Only `/assets` may list everything or filter by `source` (including `tools`). Do not load another product's feed into Studio history or a tool page.
6. **List images use TOS thumbs; preview uses originals.** Use `tosThumbUrl` / `assetListImageUrl` from `@joyai/shared` for grids and cards. Lightbox, download, canvas nodes, and detail preview keep the full `asset.url`. Do not store a second file unless process-on-read is unavailable. Video grids use `tosVideoPosterUrl` / `JoyVideoPoster` (snapshot), not a `<video>` of the mp4.
7. **Storage is content-addressed + GC-aware.** Uploads land at `uploads/by-hash/{md5}.{ext}`. Mirror skips download when the URL is already ours, remote Content-MD5 hits an existing object, or another Asset already mirrored the same `originUrl`. Unreferenced cleanup is admin `GET/POST /admin/storage/gc` (and optional `STORAGE_GC_DELETE`); never delete on Asset row remove alone.

## Frontend layout (`apps/web`)

```
src/
  app/                 # Next App Router
  components/ui/       # shadcn only
  features/<domain>/   # feature UI + hooks
  entities/<domain>/   # types thin wrappers if needed
  shared/lib/          # api client, utils
  shared/theme/        # design tokens (CSS + JS mirrors)
  shared/stores/       # zustand
```

- Prefer Server Components; mark `"use client"` only when needed.
- Forms: react-hook-form + zod (schemas from `@joyai/shared` when shared).
- UI: official shadcn + Radix under `components/ui/`. Prefer `npx shadcn@latest add <name>`; do not hand-roll Radix-less fakes.
- Imports: external → `@joyai/*` → `@/` aliases; no deep relative `../../../`.
- Ops UI lives under `/admin` (role `admin` only); no separate `apps/admin`.
- Web IA (left icon rail, this order): 灵感 `/inspire` · 探索 `/explore` · 创作 `/studio` · 项目 `/canvas`|`/manju`（列表页 Tab） · 资产 `/assets` · 工具 `/tools`.

## Visual system

Tokens live in `apps/web/src/shared/theme/design-tokens.css` (imported by `globals.css`). JS geometry that cannot be CSS is in `tokens.ts` and must stay in sync.

- **Change scale in tokens, not in random feature CSS.** New chrome uses `--joy-font-*`, `--joy-space-*`, `--joy-radius-*`, `--joy-control-h-*`, `--joy-icon-*`. Do not reintroduce 10–11px labels or 28px controls.
- **Colors:** shadcn semantic vars (`bg-background`, `bg-card`, `text-muted-foreground`) stay the color source. `--joy-*` surface aliases sit on top. App shell and page canvases use `bg-card` (or `--joy-surface`); do not mix `bg-background` and `bg-card` on the same seam or a color strip appears.
- **Skins:** override tokens on `:root` / `.dark` / `[data-skin]`. Do not fork a second palette inside a feature.
- **Type:** body 15px, labels 14px, captions 13px, micro 12px floor. Page titles use `--joy-font-display` / `--joy-font-hero`, not ad-hoc `text-2xl` stacks.
- **Canvas chrome:** rail / dock / float tool icons use `--joy-canvas-tool-icon` (20px) and `--joy-canvas-tool-btn` (40px). The node title pencil is `--joy-canvas-title-edit-icon` (12px) and must not inherit the tool-icon size. Do not hardcode `size-[18px]` (or similar) on `CanvasSvg` / toolbar buttons — it blocks the token.
- **Controls:** buttons, inputs, tabs follow `--joy-control-h-*` (32 / 36 / 40 / 44). Feature CSS should point at tokens instead of copying pixel values.

## AI tools

Catalog: `apps/web/src/features/ai-tools/tool-catalog.ts`. One slug = one page at `/tools/[slug]`. Do not build a new page per tool.

- Add an `AiToolDef`: Chinese `name` / `description` / `tags` (UTF-8 file, never `????`), `prompt` in English for the model (or Chinese for llm reverse/optimize), optional `noteHint`.
- `kind`: `image` | `video` | `llm`. LLM tools set `llmPurpose` (`reverse_prompt` / `prompt_optimize`) and submit `POST /jobs` with `kind: "llm"` + `input.toolSlug`. UI shows `result.text`; on success `reverse_prompt` / `prompt_optimize` also persist a `kind: "text"` document asset (`source=tools`) for the assets library.
- `refsRequired` / `refsMax`: image-to-image tools need refs; brand/poster tools may be `refsRequired: 0` with `noteRequired` + `promptMode: "brand-brief"`; prompt optimize uses `promptMode: "note-as-prompt"`.
- Submit jobs with `input.toolSlug`; tool history loads `scope=tools&toolSlug=`. Never show Studio / canvas / manju jobs on a tool page.
- Covers are local files under `public/tools/`. Reuse an existing cover triple if there is no dedicated art; do not hotlink third-party CDNs.
- Video-only or dedicated post-process tools stay `coming_soon` until the job kind exists. Do not fake them with an image prompt. Reverse series: separate slugs (`image-reverse`, `prompt-optimize`, `video-reverse`), not tabs on one page.

## Backend layout (`apps/server`)

```
src/
  modules/<domain>/    # module, controller, service, dto
  database/            # TypeORM entities + DatabaseModule
  common/              # guards, filters, bootstrap
  config/
```

- DTO: class-validator + Swagger decorators; prefer `PartialType` / `@nestjs/mapped-types` for update DTOs.
- One domain per module; job workers live under `modules/jobs`.
- DB access via TypeORM `@InjectRepository` only (no Prisma).
- Prefer extending `@dataui/crud-typeorm` `TypeOrmCrudService` for entity services; keep custom methods for domain logic. Do **not** blindly expose `@Crud()` on admin APIs that already have custom list contracts with the web app.
- Health: `@nestjs/terminus` at `GET /api/health`.
- Load `src/common/crud.config.ts` before `AppModule` import in `main.ts` (required by `@dataui/crud`).

## Packages

- `@joyai/shared`: zod schemas, job kinds (`image` / `video` / `audio` / llm), canvas node types, API contracts.
- `@joyai/ai-providers`: provider interfaces + OpenAI-compatible, DashScope, and Volcengine adapters. New vendors get an adapter here, not a URL in a processor.

## Canvas

- Board = pan/zoom + React absolute nodes + Zustand (+ edges in snapshot v2).
- Fabric = **inside** image-node editors only.
- Node registry: type → component + default data factory. Default sizes come from `CANVAS_NODE_SIZE` in `tokens.ts`.
- Formal refs / competitor gaps: `docs/CANVAS.md` (not `ai-comic-drama`).
- Do not introduce `@xyflow/react` without revising `docs/ADR-001-xyflow.md` (currently deferred).
- Do not treat whiteboard SDKs (tldraw/Excalidraw) as the product path.
- Director stage is `/director` (three.js), screenshots land as Assets — do not rebuild a stage inside the board.

## Naming

- Files: `kebab-case.ts` / `PascalCase.tsx` for components.
- DB: TypeORM entities (`PascalCase` class), `camelCase` columns; MySQL via `DATABASE_URL` (local `docker compose`, database `joyai`).
- Queues: `image-generation`, `video-submit`, `video-poll`.
- Git commits: Conventional Commits — see `docs/COMMIT.md`. Headers must pass husky `commit-msg` → commitlint；`type(scope)` 英文，**subject 推荐中文**.
