# Despliegue en el VPS (P8.4)

**Estado:** preparado y probado en local. **No se desplegó.** Desplegar requiere la autorización explícita del usuario, acceso al VPS, un dominio y las credenciales reales (Auth0 y OpenAI).

## Arquitectura

```text
Internet ──TLS──▶ reverse proxy del VPS (ya atiende a ReservApp)
                    ├── diagramia.<tld>      ─┐
                    └── app.diagramia.<tld>  ─┴─▶ 127.0.0.1:8080 → web (nginx: landing, editor, /api, /mcp)
                                                                    └─▶ api (gateway Node) ─▶ db (PostgreSQL 17)
```

- Sólo `web` publica un puerto, y únicamente en loopback. `api` y `db` quedan en la red interna de Docker.
- **Límites para no afectar a ReservApp:** `db` 1 CPU y 768 MB, `api` 1 CPU y 512 MB, `web` 0,5 CPU y 128 MB. Hay tope de procesos y los logs rotan (3 × 10 MB).
- **Gateway endurecido:** corre sin root, con filesystem de sólo lectura, sin capabilities y con `no-new-privileges`. El ledger de gasto vive en el volumen `api_state`.
- **nginx:** aplica CSP estricta (`script-src 'self'`, sin inline ni eval), `nosniff`, `Referrer-Policy`, `Permissions-Policy` y caché inmutable para `/assets`.
- **IP real del visitante:** nginx la toma del `X-Forwarded-For` que manda el reverse proxy (`real_ip`) y se la pasa al gateway. Los límites por IP la usan; se probó con dos clientes.

## Primera instalación

1. En el VPS, con Docker y Compose v2: `git clone` del repositorio (el checkout debe quedar en LF; ver «Fin de línea»).
2. `cp infra/env.production.example .env.production` y completar los valores. Los secretos se generan con `openssl rand -hex 32`.
3. En Auth0: crear la aplicación Regular Web con Google y email, y la callback `https://app.<tld>/api/v1/auth/callback`. Exigir la verificación de email.
4. Construir y levantar:
   ```sh
   export DIAGRAMIA_RELEASE=$(git rev-parse --short HEAD)
   docker compose --env-file .env.production -f infra/compose.prod.yml up -d --build --wait
   ```
5. En el reverse proxy del VPS: `diagramia.<tld>` y `app.diagramia.<tld>` → `http://127.0.0.1:8080`, con TLS, `X-Forwarded-For` y el `Host` original.
6. Comprobar:
   - `curl https://app.<tld>/api/ready` devuelve `ready`.
   - La landing abre y «Crear diagrama» lleva al editor.
   - El login vuelve con sesión.
   - `/#fundador` abre con un email de `DIAGRAMIA_ADMIN_EMAILS`.
7. Respaldos con cron (por ejemplo, diario a las 03:10 UTC):
   ```cron
   10 3 * * * cd /srv/diagramia && DIAGRAMIA_BACKUP_DIR=/var/backups/diagramia infra/backup.sh >> /var/log/diagramia-backup.log 2>&1
   ```
   Conviene copiar `/var/backups/diagramia` fuera del VPS.
8. **Alerta de gasto:** el gateway escribe una línea JSON `{"event":"alert","kind":"ai_spend",...}` al cruzar el 80 % del tope diario o mensual. Conectarla a un aviso, por ejemplo un filtro de logs que mande un mail.

## Actualizar

```sh
infra/backup.sh                                   # siempre antes: las migraciones sólo avanzan
git pull && export DIAGRAMIA_RELEASE=$(git rev-parse --short HEAD)
docker compose --env-file .env.production -f infra/compose.prod.yml up -d --build --wait
```

## Volver atrás

Las imágenes quedan etiquetadas con el commit. Las migraciones son aditivas (tablas, columnas, vistas), así que una versión anterior funciona sobre la base nueva:

```sh
DIAGRAMIA_RELEASE=<commit anterior> docker compose --env-file .env.production -f infra/compose.prod.yml up -d --no-build --wait
```

Si una migración futura no fuera aditiva, la vuelta atrás es restaurar el respaldo previo (ver abajo) junto con la imagen anterior.

## Restaurar un respaldo

```sh
docker compose --env-file .env.production -f infra/compose.prod.yml stop api web
docker compose --env-file .env.production -f infra/compose.prod.yml exec -T db dropdb -U diagramia --if-exists diagramia_restore
docker compose --env-file .env.production -f infra/compose.prod.yml exec -T db createdb -U diagramia diagramia_restore
docker compose --env-file .env.production -f infra/compose.prod.yml exec -T db pg_restore --exit-on-error --no-owner --no-privileges -U diagramia -d diagramia_restore < /var/backups/diagramia/<archivo>.dump
# revisar diagramia_restore y, si está bien, renombrar las bases (ALTER DATABASE … RENAME) y volver a levantar api y web
```

## Fin de línea

Las migraciones se validan por checksum. Desde el commit `720e77d`, el checksum se calcula sobre el texto con LF y `.gitattributes` fija LF para `*.sql`. Las imágenes se construyen en el VPS (Linux).

**No construir versiones anteriores a ese commit desde un checkout de Windows con `core.autocrlf=true`:** sus migraciones quedarían con CRLF y el gateway viejo no arrancaría sobre una base existente. La prueba de vuelta atrás lo detectó y se repitió con un checkout en LF.

## Evidencia local (02/10/2026)

- Pila completa con `compose.prod.yml` en Docker: tres servicios sanos y migraciones aplicadas.
- Hosts separados con sus CSP, assets inmutables, y `/api/health` y `/api/ready` respondiendo a través de nginx.
- IP real a través de dos proxies: 60 lotes aceptados y el 61.º rechazado para un cliente, mientras otro seguía pasando.
- `npm run smoke` 33/33 contra el contenedor, sin errores de consola con la CSP estricta.
- Respaldo con `infra/backup.sh` restaurado en una base nueva (149 eventos, 5 migraciones).
- Vuelta atrás al gateway del commit `5b4b0a9` sobre la base con la migración 005, y vuelta adelante, ambas sanas.
