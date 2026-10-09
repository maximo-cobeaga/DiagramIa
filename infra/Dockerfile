# Imagen de producción de Diagramia (P8.4). Dos destinos desde el mismo build:
#   api: gateway Node (IA, cuentas, documentos, telemetría, MCP remoto).
#   web: nginx con el editor (app.) y la landing (dominio principal), y /api y /mcp hacia el gateway.
# Construir desde la raíz del repo: docker compose -f infra/compose.prod.yml build

FROM node:22.23.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/interop/package.json packages/interop/
COPY packages/providers/package.json packages/providers/
COPY apps/api/package.json apps/api/
COPY apps/editor/package.json apps/editor/
COPY apps/mcp/package.json apps/mcp/
# postinstall compila core/interop/providers: se instala sin scripts y se compila todo junto abajo.
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
COPY examples examples
COPY brand brand
COPY prompts prompts
COPY schemas schemas
RUN npm run build
# Sólo dependencias de ejecución para la imagen del gateway.
RUN npm prune --omit=dev --ignore-scripts

FROM node:22.23.1-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json packages/core/
COPY --from=build --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=build --chown=node:node /app/packages/providers/package.json packages/providers/
COPY --from=build --chown=node:node /app/packages/providers/dist packages/providers/dist
COPY --from=build --chown=node:node /app/apps/mcp/package.json apps/mcp/
COPY --from=build --chown=node:node /app/apps/mcp/dist apps/mcp/dist
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/migrations apps/api/migrations
COPY --from=build --chown=node:node /app/prompts prompts
# state/ guarda el ledger de gasto diario/mensual: va en un volumen para sobrevivir reinicios y despliegues.
RUN mkdir -p state && chown node:node state
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8787/ready >/dev/null || exit 1
CMD ["node","apps/api/dist/index.js"]

FROM nginx:1.28-alpine AS web
# URL pública del editor y de los eventos para la landing; se fijan al construir.
ARG APP_URL=https://app.example.invalid/
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/editor/dist /srv/app
COPY apps/landing /srv/landing
RUN sed -i "s#<meta name=\"diagramia-app\" content=\"[^\"]*\">#<meta name=\"diagramia-app\" content=\"${APP_URL}\">#; s#<meta name=\"diagramia-events\" content=\"[^\"]*\">#<meta name=\"diagramia-events\" content=\"${APP_URL}api/v1/events\">#" /srv/landing/index.html /srv/landing/empresas.html \
 && grep -q "content=\"${APP_URL}api/v1/events\"" /srv/landing/index.html
