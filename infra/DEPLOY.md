# Despliegue en el VPS (P8.4)

**Estado:** desplegado por el usuario el 06/10/2026 en `https://diagramia.app` y `https://app.diagramia.app` (commit `4e18fc0`), detrás del nginx en Docker de ReservApp. Detalle en «Despliegue real del 06/10/2026». Cada despliegue requiere la autorización explícita del usuario.

## Arquitectura

### Formulario de empresas (08/10/2026, ADR 091)

`empresas.html` recibe el mismo `APP_URL` que la landing durante el build. El formulario manda `POST /api/v1/contact` al gateway de la app. PostgreSQL aplica automáticamente la migración `008_contact_requests.sql`: no hace falta un servicio de formularios ni una clave adicional. La allowlist de `DIAGRAMIA_ALLOWED_ORIGINS` debe incluir el origen exacto de la landing; se conserva la CSP existente.

Las consultas se leen en `https://app.<dominio>/#fundador`, «Consultas de empresas», iniciando sesión con un email verificado incluido en `DIAGRAMIA_ADMIN_EMAILS`. «Responder por email» abre el cliente de correo; «Marcar como respondida» guarda el estado, sin enviar mensajes automáticamente. Si `DIAGRAMIA_ALERT_WEBHOOK_URL` está configurado, llega un aviso sin datos personales. Sin ese webhook, la bandeja sigue funcionando. Los respaldos existentes incluyen las consultas; no hay eliminación automática.

Verificación local aislada: `npm run smoke:landing`, `npm run smoke:repository` y `npm run smoke:dashboard`. No enviar consultas de prueba al sitio público sin querer contactarse realmente.

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
2. `cp infra/env.production.example .env.production` y completar los valores. Los secretos se generan con `openssl rand -hex 32`. Revisarlo con `docker run --rm -v "$PWD":/app -w /app node:22.23.1-alpine node scripts/doctor.mjs --env .env.production --online`.
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
8. **Alerta de gasto:** al cruzar el 80 % del tope diario o mensual, el gateway escribe una línea JSON `{"event":"alert","kind":"ai_spend",...}` en el log y, si está `DIAGRAMIA_ALERT_WEBHOOK_URL`, la envía a ntfy, Discord o Slack (`docs/GUIA_PASO_A_PASO.md`, paso 5).

## Actualizar

```sh
infra/deploy.sh
```

Hace, en orden: respaldo (las migraciones sólo avanzan), `git pull --ff-only`, imágenes etiquetadas con el commit, `up -d --build --wait` y, si `DIAGRAMIA_PROXY_NETWORK` está en `.env.production`, la reconexión del contenedor `web` a la red del proxy. Termina con error si `web` no quedó en esa red. `DIAGRAMIA_SKIP_PULL=1` despliega el checkout actual.

## Despliegue automático (CI/CD)

`.github/workflows/ci.yml` corre `check` y `database` en cada push. Con ambos en verde y **sólo en `main`**, el job `deploy` entra al VPS por SSH, trae exactamente el commit probado (`git merge --ff-only $GITHUB_SHA`) y corre `infra/deploy.sh` (respaldo, build, `up --wait` y reconexión a la red del proxy). Después comprueba que `/api/ready` y `/precios.html` respondan; si no, el job falla y el log dice cómo volver atrás. Un despliegue a la vez, nunca cortado a la mitad.

**Está apagado hasta que lo habilites.** Sin la variable `DEPLOY_ENABLED`, el workflow termina en verde sin tocar el VPS.

Configuración, una sola vez:

1. **Usuario y clave dedicados en el VPS** (no uses root ni tu clave personal). En tu PC: `ssh-keygen -t ed25519 -f diagramia_deploy -C "github-actions-diagramia" -N ""`. En el VPS, el usuario necesita permiso de Docker y escritura en el checkout; agregá la clave pública (`diagramia_deploy.pub`) a su `~/.ssh/authorized_keys`. Probá a mano: `ssh -i diagramia_deploy usuario@vps "cd /ruta/del/checkout && git status"`.
2. **Huella del servidor**, tomada desde una conexión que ya confíes: `ssh-keyscan -t ed25519 <ip-o-host>` y comparála con `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` en el VPS.
3. En GitHub → Settings → Environments → **New environment** llamado `production` (opcional: agregá «Required reviewers» para aprobar cada despliegue a mano).
4. En GitHub → Settings → Secrets and variables → Actions:
   - **Secrets:** `DEPLOY_SSH_KEY` (el contenido de `diagramia_deploy`, la clave privada) y `DEPLOY_KNOWN_HOSTS` (la línea de `ssh-keyscan`).
   - **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH` (carpeta del checkout en el VPS), `DEPLOY_PORT` (sólo si el SSH no usa el 22), `DEPLOY_SITE_URL` (`https://diagramia.app`), `DEPLOY_APP_URL` (`https://app.diagramia.app`) y, por último, `DEPLOY_ENABLED=true`.
5. Borrá la clave privada de tu PC cuando esté cargada en GitHub.

Para pausar los despliegues automáticos sin tocar el código: `DEPLOY_ENABLED=false`. Para desplegar a mano: `infra/deploy.sh` en el VPS, como antes.

**Límites reales:** el job no corre migraciones aparte (las aplica el gateway al arrancar) ni revisa la IA ni el login; sólo que el sitio esté sano. El `.env.production` vive en el VPS y el workflow nunca lo toca. Un fallo después del `up` deja la versión nueva corriendo hasta que la vuelvas atrás.

## Cobro: webhook de Paddle

El gateway recibe los avisos de Paddle en `https://app.<dominio>/api/v1/billing/webhook` (nginx ya lo reenvía junto con el resto de `/api/`). Para activarlo:

1. En Paddle (sandbox o real) → Developer Tools → Notifications → **New destination**: tipo URL, esa dirección y los eventos `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.past_due` y `subscription.trialing`. Copiá el **secreto** del destino.
2. En `.env.production`: `DIAGRAMIA_PADDLE_ENV`, `DIAGRAMIA_PADDLE_API_KEY`, `DIAGRAMIA_PADDLE_WEBHOOK_SECRET` y `DIAGRAMIA_PADDLE_PRICE_PRO` (las tres últimas juntas o ninguna). `npm run doctor -- --env .env.production` las revisa.
3. En Paddle → Checkout → Checkout settings: configurá el **default payment link** con la página de pago propia, `https://app.<dominio>/pago.html` (en local, `http://127.0.0.1:5173/pago.html`). Sin eso Paddle rechaza la creación de cualquier pago (`transaction_default_checkout_url_not_set`, visible en el log del gateway como `[billing] Paddle no creó el pago`).
3b. En Paddle → Developer tools → Authentication → **Client-side tokens**: creá uno y cargalo en `DIAGRAMIA_PADDLE_CLIENT_TOKEN`. Es público (`test_…` en sandbox, `live_…` en real) y es lo único de Paddle que llega al navegador. Sin él, el editor no ofrece Pro.

**Cómo se abre el pago (ADR 094).** Paddle no redirige a una página suya: devuelve la dirección de la página de pago propia con `?_ptxn=<transacción>`, y esa página carga Paddle.js, que abre el pago encima. `pago.html` es la única página con un script de terceros y tiene su propia CSP en `infra/nginx.conf`; el editor conserva la estricta. Al terminar vuelve a `/?pro=ok` (o `/?pro=cancel`) y el editor espera el aviso firmado de Paddle para mostrar Pro.

**Si la configuración queda incompleta**, el gateway arranca igual con el cobro apagado y lo dice en el log (`COBRO APAGADO`, `COBRO SIN PÁGINA DE PAGO`, `OFERTA APAGADA`). `npm run doctor` muestra qué falta.
4. Desplegá y probá en el sandbox con una tarjeta de prueba de Paddle. No uses claves reales hasta que Paddle apruebe la cuenta.

### Oferta por tiempo limitado (ADR 092)

Es opcional y sólo funciona con el cobro configurado. Primero se crea el descuento en Paddle (Catalog → Discounts): porcentaje, aplicable al precio de Pro y, si querés que valga sólo los primeros meses, «recurring» con ese máximo de períodos. Después, en `.env.production`:

| Variable | Qué es |
|---|---|
| `DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY` | (Pago, no oferta) ID del precio anual de USD 40 en Paddle. Opcional: sin él no se ofrece el plan anual. |
| `DIAGRAMIA_OFFER_DISCOUNT_ID` | ID del descuento (`dsc_…`). Sin esta variable no hay oferta. |
| `DIAGRAMIA_OFFER_PERCENT` | El mismo porcentaje del descuento, entero entre 5 y 90. Es lo que se muestra: Paddle cobra lo que dice el descuento. |
| `DIAGRAMIA_OFFER_MONTHS` | Cuántos meses vale el descuento (1 a 12; 1 por defecto). Debe coincidir con los períodos del descuento en Paddle. |
| `DIAGRAMIA_OFFER_ENDS_AT` | Vencimiento de la campaña para todos, en ISO, por ejemplo `2026-11-30T23:59:00-03:00`. |
| `DIAGRAMIA_OFFER_WELCOME_HOURS` | Horas desde el alta de cada cuenta durante las que vale la oferta de bienvenida (0 a 720). |

Hace falta al menos una de las dos ventanas; si hay ambas, se muestra la que vence más tarde. La landing consulta `GET /v1/offer` (sólo campaña) y el editor recibe la oferta de cada cuenta en `/v1/auth/me`. Al vencer, el servidor deja de aplicar el descuento al crear el pago.

## Reverse proxy en Docker

Si el proxy del VPS es un contenedor, `127.0.0.1:8080` no es alcanzable desde adentro. El contenedor `web` se conecta a la red del proxy con un alias propio:

```sh
docker network connect --alias diagramia-web <red-del-proxy> diagramia-web-1
```

- **No declarar esa red en Compose.** Compose publica el nombre del servicio como alias en cada red: `web` pasaría a resolver también al contenedor de Diagramia dentro del otro proyecto. Con `docker network connect` sólo existen el alias elegido y el nombre del contenedor (probado: `web` y `db` no resuelven en la red del proxy).
- La conexión se pierde cuando el contenedor se crea de nuevo; `infra/deploy.sh` la repone.
- En el proxy, resolver al recibir el pedido (`resolver 127.0.0.11` y `proxy_pass` con variable hacia `http://diagramia-web:80`): si Diagramia no está, el proxy arranca igual y sólo ese sitio responde 502. Pasar `Host` y `X-Forwarded-For $remote_addr`.
- Los dos contenedores comparten red: `web` alcanza los servicios internos del otro proyecto.

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

## Despliegue real del 06/10/2026

Lo ejecutó el usuario en su VPS (2 CPU, 7,8 GB, Docker 29.1.3, Compose v2.37.0), con los comandos de este documento:

- **Pila:** tres servicios sanos con el commit `4e18fc0`, `web` en `127.0.0.1:8090`. El primer build se hizo con el dominio de ejemplo y hubo que repetirlo: `DIAGRAMIA_APP_URL` queda grabada en la imagen `web`.
- **IA:** DeepSeek por el adaptador compatible, con tarifa declarada (ADR 087) y tope de USD 1 por día. `OPENAI_API_KEY` vacía: el doctor de producción marca ese ✖ y no revisa las variables `DIAGRAMIA_COMPAT_*`. Falta que el usuario confirme el cambio respecto de ADR 045/061 para ajustar la regla.
- **Proxy:** `reservapp-bk-nginx-1` (nginx en Docker, red `reservapp-bk_default`, configuración en `/root/ReservApp-bk/nginx/default.conf`). Dos bloques nuevos para `diagramia.app` y `app.diagramia.app`, como en «Reverse proxy en Docker». Copia previa del archivo en `/root/default.conf.antes-de-diagramia`.
- **Certificado:** Let's Encrypt por webroot con los volúmenes de ReservApp (`--cert-name diagramia.app`); lo renueva el cron diario de ReservApp, que corre `certbot renew` sobre todo el volumen.
- **DNS:** Cloudflare en «DNS only». Con su proxy activado, nginx vería la IP de Cloudflare y los límites por IP serían compartidos.
- **Comprobado desde afuera por el agente:** `/api/ready` con schema 1.8.0; landing 200 desde la IP del VPS; HTTP redirige a HTTPS; CSP estricta y HSTS; `/api/v1/providers` responde 401 sin sesión; el login redirige a Auth0. El usuario informó que el login y el resto funcionan; el agente no probó login, IA ni panel.
- **Pendiente:** `DIAGRAMIA_PROXY_NETWORK=reservapp-bk_default` en `.env.production` del VPS para usar `infra/deploy.sh`; respaldo por cron; aviso de privacidad publicado con sus `[COMPLETAR]`; claves propias de Google, proveedor de email y dominio propio en Auth0. El cambio en `default.conf` vive en la carpeta de ReservApp y un despliegue suyo puede pisarlo.

**Dominio propio de Auth0:** las cuentas se identifican por emisor y sujeto. Al cambiar `DIAGRAMIA_OIDC_ISSUER` hay que actualizar el emisor de las cuentas existentes en el mismo paso (`UPDATE users SET issuer=…`), o cada persona entra como una cuenta nueva y vacía.

## Ensayo local del 06/10/2026

Repetido con el commit `3a10e6d`, que ya incluye la tarifa declarada (ADR 087) y es el que se desplegaría:

- Mismo montaje que el del 05/10 (`-p diagramia-rehearsal`, puerto 18080, secretos de prueba, sin login ni proveedores reales). Tres servicios sanos; imágenes de 324 MB (`api`) y 96 MB (`web`).
- `/api/ready` y `/api/health` con schema 1.8.0, 6 migraciones sobre una base nueva, CSP estricta y cabeceras de seguridad presentes, landing con 200 apuntando al editor, gateway sin root y con filesystem de sólo lectura.
- Gateway a través de nginx: 401 sin token ni sesión, 200 con el token del servidor (proveedores y consumo) y 403 desde un origen ajeno.
- `npm run smoke` 60/61 contra el contenedor, sin errores de consola. **Lectura correcta de ese número:** 4 de las 60 son comprobaciones de IA que se omiten solas, porque sin login el navegador no llega al gateway; la que falla es la vista previa de enlaces, por el mismo motivo. Vale también para el ensayo del 05/10. La IA y el login detrás de nginx sólo se prueban con Auth0 real, ya desplegado.
- `npm run check` 152/152. Sin probar: Auth0, un proveedor de IA real, TLS y el reverse proxy del VPS.
- El proyecto de ensayo, sus volúmenes y sus imágenes se eliminaron al terminar.

## Ensayo local del 05/10/2026

Repetido con el código del commit `1688765`, antes del primer despliegue. La tarifa declarada del proveedor compatible (ADR 087) se agregó después y sólo pasó `npm run check`:

- `compose.prod.yml` como proyecto aparte (`-p diagramia-rehearsal`, puerto 18080, secretos de prueba, sin login ni proveedores reales): las tres imágenes se construyen y los tres servicios quedan sanos.
- `/api/ready` y `/api/health` responden por nginx con schema 1.8.0; 6 migraciones aplicadas sobre una base nueva; landing y `/privacidad.html` con 200; CSP estricta presente.
- `npm run smoke` 60/61 contra el contenedor, sin errores de consola. La que falla es la vista previa de enlaces: pide sesión y el ensayo no tenía login, así que el gateway respondió «Token del gateway inválido o ausente». No se probaron Auth0, un proveedor de IA real, TLS ni el reverse proxy del VPS.
- El proyecto de ensayo, sus volúmenes y sus imágenes se eliminaron al terminar.

## Evidencia local (02/10/2026)

- Pila completa con `compose.prod.yml` en Docker: tres servicios sanos y migraciones aplicadas.
- Hosts separados con sus CSP, assets inmutables, y `/api/health` y `/api/ready` respondiendo a través de nginx.
- IP real a través de dos proxies: 60 lotes aceptados y el 61.º rechazado para un cliente, mientras otro seguía pasando.
- `npm run smoke` 33/33 contra el contenedor, sin errores de consola con la CSP estricta.
- Respaldo con `infra/backup.sh` restaurado en una base nueva (149 eventos, 5 migraciones).
- Vuelta atrás al gateway del commit `5b4b0a9` sobre la base con la migración 005, y vuelta adelante, ambas sanas.
