#!/bin/sh
# Actualiza Diagramia en el VPS (P8.4): respaldo, código nuevo, imágenes y, si el reverse proxy corre en Docker,
# reconexión del contenedor web a la red de ese proxy (se pierde cada vez que el contenedor se crea de nuevo).
# Uso (desde cualquier carpeta del VPS):
#   infra/deploy.sh
# Variables, del entorno o de .env.production: DIAGRAMIA_PROXY_NETWORK (red Docker del proxy; vacía si el proxy
# corre en el host) y DIAGRAMIA_PROXY_ALIAS (diagramia-web). Del entorno: DIAGRAMIA_ENV_FILE, DIAGRAMIA_COMPOSE_PROJECT
# y DIAGRAMIA_SKIP_PULL=1 para desplegar el checkout actual sin traer cambios.
set -eu
cd "$(dirname "$0")/.."
env_file="${DIAGRAMIA_ENV_FILE:-.env.production}"
project="${DIAGRAMIA_COMPOSE_PROJECT:-diagramia}"
[ -f "$env_file" ] || { echo "No existe $env_file." >&2; exit 1; }
value(){ sed -n "s/^$1=\([^#]*\).*/\1/p" "$env_file" | tail -n 1 | tr -d '[:space:]'; }
network="${DIAGRAMIA_PROXY_NETWORK:-$(value DIAGRAMIA_PROXY_NETWORK)}"
alias="${DIAGRAMIA_PROXY_ALIAS:-$(value DIAGRAMIA_PROXY_ALIAS)}"
compose(){ docker compose -p "$project" --env-file "$env_file" -f infra/compose.prod.yml "$@"; }

# Las migraciones sólo avanzan: siempre un respaldo antes, salvo en la primera instalación.
if [ -n "$(compose ps -q db 2>/dev/null)" ]; then infra/backup.sh; fi
if [ "${DIAGRAMIA_SKIP_PULL:-}" != "1" ]; then git pull --ff-only; fi
DIAGRAMIA_RELEASE="$(git rev-parse --short HEAD)"; export DIAGRAMIA_RELEASE
compose up -d --build --wait

if [ -n "$network" ]; then
  web="$(compose ps -q web)"
  # Con alias propio y no por Compose: así el nombre «web» de Diagramia no aparece en la red del otro proyecto.
  docker network connect --alias "${alias:-diagramia-web}" "$network" "$web" 2>/dev/null || true
  docker inspect "$web" --format '{{range $name,$_ := .NetworkSettings.Networks}}{{$name}} {{end}}' | grep -qw "$network" \
    || { echo "El contenedor web no quedó conectado a la red $network: el sitio va a responder 502." >&2; exit 1; }
  echo "web conectado a $network como ${alias:-diagramia-web}."
fi
echo "Diagramia $DIAGRAMIA_RELEASE desplegado."
