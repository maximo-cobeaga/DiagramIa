# Telemetría de producto

Fuente de las métricas: `DIAGRAMIA_SESION_PRODUCTO_NEGOCIO.md`. Decisión de diseño: ADR 046 y 050. Contrato: `packages/core/src/telemetry.ts`.

## Qué se mide y qué no

Se mide **comportamiento**: qué herramientas se usan, cuántos cambios hay por tipo, exportaciones, errores, tiempos de carga, el resultado y el costo de cada pedido de IA, y la opinión 👍/👎.

**Nunca** se envía el contenido: labels, títulos, texto de los diagramas, prompts, nombres de archivo, mensajes de error, emails ni URLs completas. El contrato no tiene campos de texto libre. Los valores son enums, números, IDs aleatorios y slugs cortos. El gateway rechaza el lote entero si un evento no cumple el contrato (400), y una prueba lo comprueba.

Del contexto de la visita se guarda: campaña UTM (como slug), **sólo el host** del referrer, el path de entrada sin querystring, tipo de dispositivo, navegador, sistema, idioma y tamaño de ventana.

## Flujo

1. **Landing** (`apps/landing/telemetry.js`): registra `landing_view` y `landing_cta_clicked`. Los botones «Crear diagrama» llevan al editor con `aid` (ID anónimo), `sid` (sesión) y los UTM. El editor adopta esos valores y los quita de la URL.
2. **Editor** (`apps/editor/src/telemetry.ts`): valida cada evento contra el contrato, lo encola y lo envía por lotes de hasta 50. Envía cada 10 s, al llegar a 20 eventos y al ocultar la página. Ante un 503 deja de enviar durante esa carga; ante un 429 o un 5xx espera y reintenta. Nunca bloquea el editor.
3. **Gateway** (`POST /v1/events`): es público, porque los visitantes no tienen cuenta. Para aceptar un lote exige un origen permitido, el header `x-diagramia-client`, un cuerpo de 64 KB como máximo y no superar 60 lotes por minuto por IP. Si hay sesión, vincula el ID anónimo con la cuenta (`telemetry_identities`).
4. **Servidor**: registra `ai_request` en cada pedido de IA, también los fallidos, porque ya consumieron tokens. Incluye resultado, código de error, tokens, tokens de caché, costo USD, latencia, llamadas y reparaciones. Registra además `signup_completed` o `signed_in` al volver del login.
5. **PostgreSQL** (`apps/api/migrations/003_telemetry.sql`): `telemetry_events` es idempotente por ID de evento. Si la hora del cliente difiere en más de 24 h, se usa la hora de recepción.

## Privacidad del usuario

- El editor respeta **Do Not Track** y **Global Privacy Control**: con cualquiera de los dos no envía nada.
- En «Sesión → Privacidad» hay un interruptor para apagar la medición. Apagada, no guarda ningún ID en el navegador.
- **Aviso de privacidad:** el borrador está en `apps/editor/public/privacidad.html`, servido en `/privacidad.html` y enlazado desde la landing y desde «Sesión → Privacidad». Tiene datos `[COMPLETAR]`.
- Al eliminar una cuenta, sus eventos quedan sin `user_id` y se borra el vínculo anónimo→cuenta.
- **Pendiente antes de lanzar:** revisión legal del aviso de privacidad y decidir si hace falta un banner de consentimiento para visitantes de la UE (ePrivacy/GDPR). Mientras tanto, la medición es propia, sin terceros y sin contenido.

## Configuración

| Variable | Uso |
|---|---|
| `DIAGRAMIA_DATABASE_URL` | Requisito: la telemetría vive en PostgreSQL. Sin base, `/v1/events` responde 503. |
| `DIAGRAMIA_TELEMETRY=0` | Apaga la ingesta. |
| `DIAGRAMIA_EVENTS_PER_MINUTE` | Lotes por minuto por IP (60 por defecto). |
| `DIAGRAMIA_TRUST_PROXY=1` | Detrás del reverse proxy propio: la IP es la última de `X-Forwarded-For`. Sin esto, se usa la IP de la conexión. |
| `DIAGRAMIA_ALLOWED_ORIGINS` | Debe incluir el origen de la landing para que pueda enviar eventos. |
| `<meta name="diagramia-app">` y `<meta name="diagramia-events">` en la landing | URL del editor y del endpoint. Vacías, la landing no mide ni redirige. |

## Consultas de ejemplo

Embudo de la última semana, por visitante:

```sql
WITH steps AS (
  SELECT COALESCE(i.user_id, e.anonymous_id::text) AS who, e.name
  FROM telemetry_events e LEFT JOIN telemetry_identities i ON i.anonymous_id = e.anonymous_id
  WHERE e.occurred_at > now() - interval '7 days'
)
SELECT name, count(DISTINCT who) FROM steps
WHERE name IN ('landing_view','board_opened','first_element_created','ai_opened','signup_started','useful_diagram_created')
GROUP BY name;
```

Costo de IA por usuario en el mes:

```sql
SELECT user_id, count(*) AS pedidos, sum((props->>'costUsd')::numeric) AS usd
FROM telemetry_events WHERE origin = 'server' AND name = 'ai_request' AND occurred_at > date_trunc('month', now())
GROUP BY user_id ORDER BY usd DESC NULLS LAST;
```

## Uso, monetización y landing (ADR 092)

Eventos nuevos, todos enums o conteos (el contrato sigue sin texto libre):

| Grupo | Eventos |
|---|---|
| Uso del editor | `tool_selected`, `panel_toggled`, `welcome_choice`, `search_used`, `animation_created` (origen y pasos), `animation_played`, `animation_finished`, `ai_suggestion_clicked`, `ai_question_answered` (sólo «opción» u «otro», nunca el texto) |
| Sesión | `session_summary`: tiempo activo (con interacción reciente y página visible), cambios, pedidos de IA, tamaño del diagrama (nodos, conexiones, animaciones) y si usó IA o animaciones. Uno por sesión de uso, al ocultarse la página |
| Monetización | `upgrade_prompt_shown`, `offer_viewed`, `checkout_started`, `checkout_failed`, `limit_reached` |
| Landing | `landing_section_viewed` (secciones conocidas), `landing_scroll_depth` (25/50/75/100) y los botones de precios en `landing_cta_clicked` |

El panel del fundador agrega «Suscripción y oferta» (del aviso al pago, landing → precios → Pro, oferta y límites) y «Uso del editor» (sesiones, tiempo activo, adopción de IA y animaciones, preguntas respondidas con «Otro», animaciones que llegan al final). Las métricas diarias nuevas se calculan igual que las anteriores; los días previos a este cambio figuran en cero porque esos eventos no existían.

## Dashboard del fundador (P7.3)

Abrí el editor en `/#fundador` con una cuenta cuyo email verificado esté en `DIAGRAMIA_ADMIN_EMAILS` (separados por comas). Muestra los 10 indicadores de la sección 12 de la sesión de negocio para la semana UTC actual contra la anterior, más costo de IA, fricción y una tabla de los últimos 14 días. Definiciones: ADR 053. API: `GET /v1/admin/dashboard?to=AAAA-MM-DD`.

`npm run smoke:dashboard` siembra cinco visitantes en dos semanas y comprueba que los 10 valores coinciden con los calculados a mano, que los agregados son idempotentes, que otra cuenta recibe 403 y que la vista no desborda en escritorio ni en móvil.
