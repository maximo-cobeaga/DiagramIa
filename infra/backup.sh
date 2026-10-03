#!/bin/sh
# Respaldo lógico de la base de producción (P8.4). Escribe un .partial, comprueba que sea un dump válido de
# PostgreSQL y recién entonces lo publica; borra los respaldos con más de DIAGRAMIA_BACKUP_DAYS días (14 por defecto).
# Uso (desde la raíz del repo, idealmente por cron):
#   DIAGRAMIA_BACKUP_DIR=/var/backups/diagramia infra/backup.sh
# Variables: DIAGRAMIA_ENV_FILE (.env.production), DIAGRAMIA_COMPOSE_PROJECT (diagramia), DIAGRAMIA_BACKUP_DIR, DIAGRAMIA_BACKUP_DAYS.
set -eu
cd "$(dirname "$0")/.."
env_file="${DIAGRAMIA_ENV_FILE:-.env.production}"
project="${DIAGRAMIA_COMPOSE_PROJECT:-diagramia}"
dir="${DIAGRAMIA_BACKUP_DIR:-state/backups}"
days="${DIAGRAMIA_BACKUP_DAYS:-14}"
mkdir -p "$dir"
file="$dir/diagramia-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -p "$project" --env-file "$env_file" -f infra/compose.prod.yml exec -T db \
  pg_dump -Fc --no-owner --no-privileges -U diagramia -d diagramia > "$file.partial"
# Un dump en formato custom empieza con PGDMP; un archivo vacío o un error de texto no se publica.
if [ "$(head -c 5 "$file.partial")" != "PGDMP" ]; then
  rm -f "$file.partial"
  echo "Respaldo inválido: no se publicó." >&2
  exit 1
fi
mv "$file.partial" "$file"
find "$dir" -name 'diagramia-*.dump' -type f -mtime "+$days" -delete
echo "Respaldo listo: $file ($(wc -c < "$file") bytes)"
