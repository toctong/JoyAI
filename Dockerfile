# JoyAI web + server + nginx in one image.
# Public: nginx :3000 → Next :3002 + Nest :3001 (/api, /socket.io with WS).

FROM node:22-alpine AS web-build

WORKDIR /app

ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true

ARG NPM_REGISTRY=https://registry.npmmirror.com
# Relative /api → browser same-origin; Docker nginx (or Next rewrite) → Nest.
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_WS_URL=
ARG NEXT_PUBLIC_STATIC_CDN=https://cdn.jsdelivr.net/gh/toctong/image-hosting@main/joyai

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm config set registry "${NPM_REGISTRY}" \
    && pnpm install --frozen-lockfile --filter @joyai/web...

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_STATIC_CDN=${NEXT_PUBLIC_STATIC_CDN}

RUN pnpm --filter @joyai/shared build \
    && pnpm --filter @joyai/web build

FROM node:22-alpine AS server-build

WORKDIR /app

ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    CI=true

ARG NPM_REGISTRY=https://registry.npmmirror.com

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm config set registry "${NPM_REGISTRY}" \
    && pnpm install --frozen-lockfile --filter @joyai/server...

RUN pnpm --filter @joyai/shared build \
    && pnpm --filter @joyai/ai-providers build \
    && pnpm --filter @joyai/server build \
    && pnpm --filter @joyai/server deploy --prod /out

# dist/ is gitignored, so deploy may omit compiled output. Copy it into the
# deployed package tree (do not replace those directories; pnpm links live there).
RUN cp -a apps/server/dist /out/dist \
    && SHARED="$(realpath /out/node_modules/@joyai/shared)" \
    && AI="$(realpath /out/node_modules/@joyai/ai-providers)" \
    && cp -a packages/shared/dist "$SHARED/dist" \
    && cp -a packages/ai-providers/dist "$AI/dist" \
    && case "$SHARED" in /out/*) ;; *) echo "shared link escaped /out: $SHARED"; exit 1 ;; esac \
    && case "$AI" in /out/*) ;; *) echo "ai-providers link escaped /out: $AI"; exit 1 ;; esac \
    && test -f /out/dist/main.js \
    && node -e "require('/out/node_modules/@joyai/shared'); require('/out/node_modules/@joyai/ai-providers')"

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache nginx \
    && mkdir -p /var/cache/nginx /var/log/nginx /tmp/nginx \
    && rm -f /etc/nginx/http.d/default.conf

COPY --from=server-build /out /app/server
COPY --from=web-build /app/apps/web/.next/standalone /app/web
COPY --from=web-build /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=web-build /app/apps/web/public /app/web/apps/web/public
COPY docker/nginx.conf /etc/nginx/joyai.conf
COPY docker/entrypoint.sh /entrypoint.sh

RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh \
    && nginx -t -c /etc/nginx/joyai.conf

EXPOSE 3000 3001

CMD ["/entrypoint.sh"]
