# Guía paso a paso: lo que tenés que hacer vos

Estos pasos necesitan tus cuentas, tu tarjeta o tu servidor, así que no los puedo hacer yo. Están en orden: hacé uno, comprobá que funcione y pasá al siguiente.

Si algo falla, **copiá el mensaje completo y pasámelo**. No hace falta que lo entiendas.

> Los sitios de OpenAI, Auth0 y Hostinger cambian sus menús cada tanto. Si un botón no tiene exactamente el nombre que digo, buscá uno parecido.

---

## Paso 0. Abrir la terminal en la carpeta del proyecto

1. Abrí **Visual Studio Code**.
2. Menú **File → Open Folder…** y elegí `C:\Users\MAXIMO\Desktop\DiagramIa\Diagramia_Development`.
3. Menú **Terminal → New Terminal**. Abajo aparece una ventana donde se escriben comandos.
4. Escribí esto y apretá Enter:
   ```
   npm run doctor
   ```
   Te muestra qué está listo (✔), qué conviene revisar (⚠) y qué falta (✖), siempre con el paso de esta guía que lo arregla. Volvé a correrlo después de cada paso.

**Para editar el archivo de configuración** `.env` (en la raíz del proyecto): en VS Code, hacé clic en `.env` en la lista de archivos de la izquierda. Cada línea es `NOMBRE=valor`, sin espacios alrededor del `=` y sin comillas. Guardá con **Ctrl+S**.

---

## Mientras tanto: DeepSeek para probar (ya configurado)

En `.env` hay un bloque `DIAGRAMIA_COMPAT_*` con tu clave de DeepSeek y `DIAGRAMIA_ACCOUNT_PROVIDERS=compatible`. Con eso la IA funciona para probar, incluso con login. El tope en dólares de Diagramia **no** lo controla mientras no conozca la tarifa de DeepSeek: dejá poco saldo cargado en <https://platform.deepseek.com>. Para que el tope también lo frene, copiá de su página de precios el valor por millón de tokens en `DIAGRAMIA_COMPAT_INPUT_USD_PER_MTOK` y `DIAGRAMIA_COMPAT_OUTPUT_USD_PER_MTOK` (y, si lo publican, `DIAGRAMIA_COMPAT_CACHED_INPUT_USD_PER_MTOK`), y reiniciá `npm run api`. Cuando tengas la clave de OpenAI, hacé el paso 1 y borrá las líneas de DeepSeek y la de `DIAGRAMIA_ACCOUNT_PROVIDERS`.

---

## Paso 1. Clave de OpenAI para GPT-6 Luna (≈ 15 minutos, cuesta algunos dólares)

La IA del plan gratis usa GPT-6 Luna. Hace falta una clave de la API de OpenAI: no es lo mismo que ChatGPT Plus, se paga aparte y por uso.

1. Entrá a <https://platform.openai.com> y creá una cuenta, o entrá con la tuya.
2. **Cargá crédito:** Settings → **Billing** → agregá una tarjeta y cargá USD 5 o 10. Alcanza para muchísimas pruebas: cada pedido cuesta del orden de USD 0,002.
3. **Poné un tope de gasto en OpenAI** (protección extra, además de la de Diagramia): Settings → **Limits** → fijá un presupuesto mensual, por ejemplo USD 10, y que te avise por mail.
4. **Creá la clave:** <https://platform.openai.com/api-keys> → **Create new secret key** → nombre «Diagramia local» → **Create**. Copiala: empieza con `sk-` y **no se vuelve a mostrar**.
5. En `.env`, agregá una línea con la clave:
   ```
   OPENAI_API_KEY=sk-...pegá-acá-la-clave...
   ```
   Guardá. **Nunca compartas esta clave ni la subas a GitHub.** El archivo `.env` ya está excluido de Git.
6. Comprobá la clave sin gastar nada:
   ```
   npm run doctor -- --online
   ```
   Tiene que decir «✔ OpenAI acepta la clave y el modelo gpt-6-luna está disponible».
7. **La prueba real** (gasta unos centavos). Necesitás dos terminales: en VS Code, el **+** de la terminal abre otra.
   - Terminal 1:
     ```
     npm run api
     ```
     Dejala abierta. Tiene que decir `openai listo · gpt-6-luna`.
   - Terminal 2:
     ```
     npm run smoke:ai -- openai
     ```
   Al final muestra cuántas comprobaciones pasaron y el costo por pedido. **Copiame todo lo que imprime.**
8. (Opcional, para ajustar el costo) Repetí la prueba con distintos niveles de razonamiento. En `.env` poné `DIAGRAMIA_OPENAI_REASONING_EFFORT=none`, cerrá la terminal 1 con **Ctrl+C**, volvé a correr `npm run api` y repetí el smoke. Hacé lo mismo con `low` y con `medium`, y pasame los tres resultados: con eso elegimos el mejor equilibrio entre calidad y costo.

> Con el login activado, la IA pide sesión y la prueba automática no puede entrar. Si ya hiciste el paso 3, para correr el smoke poné un `#` adelante de las líneas `DIAGRAMIA_OIDC_*`, reiniciá `npm run api` y, al terminar, sacá los `#`.

---

## Paso 2. Base de datos en tu PC (≈ 5 minutos)

La base guarda cuentas, la nube, la medición y el panel del fundador.

1. Abrí **Docker Desktop** y esperá a que abajo a la izquierda diga **Engine running**.
2. En la terminal:
   ```
   npm run db:up
   ```
3. Generá un secreto:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copiá el texto largo que aparece.
4. En `.env` agregá (el secreto va en la segunda línea):
   ```
   DIAGRAMIA_DATABASE_URL=postgres://diagramia:diagramia-local-only@127.0.0.1:5433/diagramia
   DIAGRAMIA_DOCUMENTS_TOKEN=pegá-acá-el-secreto
   ```
5. `npm run doctor` tiene que decir «✔ PostgreSQL responde».

Para apagar la base cuando no la uses: `npm run db:down`. Tus datos no se borran.

---

## Paso 3. Login con Auth0 (≈ 20 minutos, gratis)

1. Entrá a <https://auth0.com> → **Sign up**. Elegí una región cercana, por ejemplo **US**. Te crea un *tenant*, que es tu espacio en Auth0.
2. Menú izquierdo **Applications → Applications → Create Application**:
   - Nombre: `Diagramia`.
   - Tipo: **Regular Web Applications** (no «Single Page»).
   - Botón **Create**. Si te pregunta la tecnología, salteá esa parte.
3. Pestaña **Settings** de la aplicación:
   - Anotá **Domain** (algo como `dev-abc123.us.auth0.com`), **Client ID** y **Client Secret** (con el ícono del ojo para verlo).
   - **Allowed Callback URLs:** `http://127.0.0.1:5173/api/v1/auth/callback`
   - **Allowed Logout URLs:** `http://127.0.0.1:5173/`
   - **Allowed Web Origins:** `http://127.0.0.1:5173`
   - Abajo de todo: **Save Changes**.
4. **Formas de entrar:** menú **Authentication**.
   - **Database → Username-Password-Authentication:** que esté activo y habilitado para la aplicación Diagramia.
   - **Social → google-oauth2:** activalo para la aplicación. Para probar sirven las «claves de desarrollo» de Auth0; para producción hay que crear claves propias de Google (el paso 6 lo menciona).
5. **Verificación de email:** Auth0 manda el mail de verificación a quien se registra con email y contraseña. Diagramia no deja usar la IA hasta que el email esté verificado. Para probar alcanza con el envío de Auth0. Para producción, en **Branding → Email Provider**, conectá un proveedor propio, porque el de Auth0 es limitado.
6. En `.env` agregá (reemplazando por tus datos):
   ```
   DIAGRAMIA_OIDC_ISSUER=https://dev-abc123.us.auth0.com/
   DIAGRAMIA_OIDC_CLIENT_ID=tu-client-id
   DIAGRAMIA_OIDC_CLIENT_SECRET=tu-client-secret
   DIAGRAMIA_OIDC_REDIRECT_URI=http://127.0.0.1:5173/api/v1/auth/callback
   DIAGRAMIA_OIDC_HOME_URL=http://127.0.0.1:5173/
   DIAGRAMIA_ADMIN_EMAILS=tu-email@ejemplo.com
   ```
   El ISSUER lleva `https://` adelante y **una barra `/` al final**. En `DIAGRAMIA_ADMIN_EMAILS` va el mismo email con el que vas a entrar, verificado: habilita el panel del fundador y la IA sin cuota de créditos ni límite por minuto. El chat muestra «Admin». El presupuesto global de tokens y gasto del gateway sigue protegiendo el saldo; si lo alcanzás, ajustá `DIAGRAMIA_DAILY_TOKEN_BUDGET`, `DIAGRAMIA_DAILY_USD_BUDGET` o `DIAGRAMIA_MONTHLY_USD_BUDGET` en el servidor. Reiniciá `npm run api` al cambiar estas variables.
7. `npm run doctor -- --online` tiene que decir «✔ Auth0 responde y el issuer coincide exactamente».
8. Probalo:
   - Terminal 1: `npm run api`
   - Terminal 2: `npm run dev`
   - Abrí **<http://127.0.0.1:5173>**. Usá `127.0.0.1`, no `localhost`: la sesión queda guardada para esa dirección exacta.
   - Panel derecho → pestaña **Sesión** → **Iniciar sesión**.
   - Registrate con email, verificá el mail y volvé a entrar. O entrá con Google.
   - Tiene que aparecer tu email con «✓ verificado».
9. Probá la IA desde el chat (pestaña **IA**) y después abrí **<http://127.0.0.1:5173/#fundador>**: vas a ver el panel con tus primeros datos.

---

## Paso 4. Revisar a mano (sin apuro)

Usá Diagramia como lo usaría alguien nuevo y anotá todo lo que te resulte raro. La lista de qué mirar está al final de `VALIDATION.md`. Pasame lo que encuentres, aunque sea «esto no se entiende».

---

## Paso 5. Alertas de gasto en el celular (≈ 5 minutos, gratis)

Si la IA llega al 80 % del tope de gasto, te llega una notificación.

1. Instalá la app **ntfy** (Android o iPhone).
2. Inventá un nombre de canal **difícil de adivinar**, por ejemplo `diagramia-alertas-k7x2m9q4`. Cualquiera que sepa el nombre puede leerlo, aunque sólo vería montos.
3. En la app: **+** → escribí ese nombre → **Subscribe**.
4. Probalo desde la terminal (reemplazá por tu nombre de canal):
   ```
   curl.exe -d "Prueba de Diagramia" https://ntfy.sh/diagramia-alertas-k7x2m9q4
   ```
   Te tiene que llegar la notificación.
5. En `.env` (y más adelante en `.env.production`):
   ```
   DIAGRAMIA_ALERT_WEBHOOK_URL=https://ntfy.sh/diagramia-alertas-k7x2m9q4
   ```

También funciona con un webhook de Discord o de Slack: pegá su URL en lugar de la de ntfy.

---

## Paso 6. Publicar Diagramia en el VPS

Hacelo cuando los pasos 1 a 4 estén bien. Me tenés que confirmar que querés desplegar. Lo podemos hacer juntos: vos ejecutás y yo te digo qué poner.

**Qué necesitás:**
- Un dominio, por ejemplo `diagramia.com` (Hostinger, Namecheap, NIC Argentina…).
- Acceso SSH a tu VPS: en hPanel de Hostinger, **VPS → Overview**, ahí está la IP y el usuario `root`.

**6.1. Apuntar el dominio al VPS.** En el panel DNS de tu dominio, creá dos registros **A**:

| Nombre | Apunta a |
|---|---|
| `@` (el dominio solo) | la IP de tu VPS |
| `app` | la IP de tu VPS |

Puede tardar hasta unas horas en propagarse.

**6.2. Entrar al VPS.** Desde la terminal de VS Code:
```
ssh root@IP-DE-TU-VPS
```

**6.3. Ver qué proxy usa ReservApp.** Copiame lo que devuelva:
```
ss -ltnp | grep -E ':80 |:443 '
```
Así sé si tu VPS usa nginx, Caddy o Traefik, y te paso la configuración exacta para sumar Diagramia sin tocar ReservApp.

**6.4. Bajar Diagramia y configurarlo** (en el VPS):
```
cd /srv && git clone https://github.com/maximo-cobeaga/DiagramIa.git diagramia && cd diagramia
cp infra/env.production.example .env.production
nano .env.production
```
En el editor `nano`:
- completá cada valor; los secretos se generan con `openssl rand -hex 32`;
- en Auth0, agregá también las URLs `https://app.tu-dominio.com/...` en Callback, Logout y Web Origins;
- en OpenAI, creá una clave aparte llamada «Diagramia producción».

Para guardar: **Ctrl+O**, Enter, y **Ctrl+X** para salir. Después:
```
docker run --rm -v "$PWD":/app -w /app node:22.23.1-alpine node scripts/doctor.mjs --env .env.production --online
```
(Corre el diagnóstico dentro de Docker, así no hace falta instalar Node en el VPS. Tiene que terminar en «✔ Sin problemas».)

**6.5. Levantar:**
```
export DIAGRAMIA_RELEASE=$(git rev-parse --short HEAD)
docker compose --env-file .env.production -f infra/compose.prod.yml up -d --build --wait
```

**6.6. Conectar el proxy:** con lo del paso 6.3 te paso las líneas exactas. El destino siempre es `http://127.0.0.1:8080`.

**6.7. Respaldo diario:** `crontab -e` y agregá esta línea:
```
10 3 * * * cd /srv/diagramia && DIAGRAMIA_BACKUP_DIR=/var/backups/diagramia infra/backup.sh >> /var/log/diagramia-backup.log 2>&1
```

El detalle técnico, cómo actualizar y cómo volver atrás está en `infra/DEPLOY.md`.

---

## Paso 7. Decisiones que son tuyas (no técnicas)

1. **Licencia del código.** El repositorio es público y todavía no tiene licencia, lo que equivale a «todos los derechos reservados». Opciones:
   - Dejarlo así, o hacer el repositorio **privado** en GitHub: Settings → Danger Zone → Change visibility. Es lo más simple si querés que sea un producto comercial.
   - Una licencia abierta (MIT o Apache-2.0): otros pueden usar y copiar el código.
   - Decime cuál preferís y la agrego.
2. **Aviso de privacidad:** el borrador está en `apps/editor/public/privacidad.html` y describe exactamente lo que hace el sistema. Completá las partes `[COMPLETAR]` (tu nombre o empresa, email de contacto, plazos) y que lo revise un abogado antes de publicar.
3. **Visitantes de Europa:** si vas a buscar usuarios en la UE, preguntale al abogado si hace falta un aviso de consentimiento para la medición anónima. Si dice que sí, lo agrego.
4. **Subir los cambios a GitHub:** decime «hacé push» y lo hago. Así también corre la verificación automática (CI) en GitHub.

---

## Paso 8. Suscripciones (plan Pro)

**Estado al 08/10/2026:** el cobro está construido (ADR 089) y apagado. Plan Pro de USD 5 por mes: 400 créditos de IA, 100 diagramas, 1 GB y 200 elementos propios. Reembolso en las primeras 48 horas. Faltan las claves de Paddle en el servidor y probarlo de punta a punta en el sandbox. El orden importa: Paddle no aprueba una cuenta real sin un sitio publicado con precios, términos y reembolsos, así que **el paso 6 va primero**.

**Para encender el cobro en el sandbox** (después de desplegar): creá el destino de webhook y el default payment link como dice `infra/DEPLOY.md`, «Cobro: webhook de Paddle», cargá las cuatro variables `DIAGRAMIA_PADDLE_*` en `.env.production` y corré `infra/deploy.sh`. El producto y el precio ya existen en el sandbox.

Lo que sigue más abajo es la lista original de decisiones y cuentas; las decisiones 8.1 ya están tomadas salvo lo indicado en el informe del 08/10.

**8.1. Decisiones que son tuyas** (sin esto no puedo programar el plan):
- **Qué incluye Pro:** cuántos créditos de IA por mes, cuántos diagramas en la nube y cuánto espacio. Free hoy es 20 créditos por mes (6 por día), 3 diagramas y 30 MB.
- **Precio:** mensual, y si querés también anual. En qué moneda lo mostrás (USD es lo habitual).
- **Qué pasa al dejar de pagar:** propongo que la cuenta vuelva a Free sin borrar nada; lo que exceda el límite queda en sólo lectura.
- **Reembolsos:** el plazo y las condiciones. Paddle exige una política publicada.
- **A nombre de quién se vende:** tu nombre o una empresa. Ese nombre va en los Términos.

Para decidir precio y cuotas hace falta el costo real por pedido. Con DeepSeek la única muestra es la tuya (`docs/USO_DEEPSEEK.md`, unos USD 0,002 por pedido); con GPT-6 Luna todavía no se midió (paso 1).

**8.2. Cuenta de prueba de Paddle (sandbox).** Creala en <https://sandbox-vendors.paddle.com/signup>. Es un entorno aparte del real y no pide aprobación del sitio: con ella construyo y pruebo todo sin mover dinero. Pasame por `.env` (nunca por chat ni en GitHub):
- una **API key**: Developer Tools → Authentication;
- un **client-side token**, en la misma pantalla;
- el **secreto del webhook**: Developer Tools → Notifications → New destination. La dirección te la digo cuando esté el código;
- el **ID del precio** de Pro, una vez creado el producto en Catalog.

**8.3. Cuenta real de Paddle.** En <https://www.paddle.com> → Sign up. La revisan en tres partes: el sitio, el negocio y tu identidad. Para aprobar el sitio, su documentación pide:
- una descripción clara del producto y sus funciones;
- los precios a la vista, sin tener que iniciar sesión;
- Términos y Condiciones, Política de Reembolso y Política de Privacidad, accesibles desde la navegación del sitio;
- tu nombre o el de tu empresa dentro de los Términos;
- el sitio publicado con HTTPS.

Las páginas de precios, términos y reembolsos las preparo yo como borrador; el contenido legal lo tenés que revisar vos, idealmente con un abogado. Argentina no figura en la lista de países no admitidos para vendedores (revisado el 05/10/2026). Antes de cargar los datos de cobro, confirmá en el panel de Paddle las comisiones, el mínimo y el medio de pago hacia Argentina: cambian y no los verifiqué en su documentación.

**8.4. Contador.** Vas a recibir pagos del exterior por un servicio. Preguntale cómo facturarlo y declararlo según tu situación fiscal antes de activar la cuenta real.

**8.5. Lo que hago yo cuando tenga 8.1 y 8.2:** planes y estado de suscripción en la base, cuotas según el plan, recepción firmada y sin duplicados de los avisos de Paddle, botón para suscribirse, pantalla para cancelar o cambiar el medio de pago, y pruebas. Con la cuenta real aprobada (8.3) sólo se cambian las claves en `.env.production`.
