# Revisión de seguridad (P8.3)

Revisión hecha el 02/10/2026 sobre el código y la configuración de despliegue. **No reemplaza** una revisión externa ni la prueba con Auth0 real.

## Comprobado

| Área | Estado | Evidencia |
|---|---|---|
| Dependencias | `npm audit --omit=dev`: 0 vulnerabilidades conocidas | 02/10/2026 |
| Secretos | Ninguna clave en el repo (búsqueda de patrones de OpenAI, Anthropic, AWS y claves privadas). Nada usa `VITE_`. Las claves de proveedores y los tokens del servidor nunca llegan al navegador. | `.env*` ignorados |
| Sesión | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` con HTTPS. Sesión opaca con hash en PostgreSQL. OIDC con PKCE, state, nonce y firma verificada. | ADR 037, `oidc.test.ts` |
| CSRF | Toda ruta con estado exige el header `x-diagramia-client`: fuerza un preflight CORS, que sólo pasa con origen permitido. | `gateway.test.ts` |
| Aislamiento de datos | Documentos por proyecto, MCP remoto con audience exacta y scopes. | `smoke:repository`, `smoke:mcp-remote` |
| Abuso de la IA | Email verificado, límites por IP y por cuenta, créditos, reserva en USD, tope diario y mensual con alerta. Proveedores por plan. | ADR 049/052 |
| Telemetría | Contrato sin texto libre, endpoint acotado (origen, header, 64 KB, límite por IP), sólo IDs con forma de ID. Se respetan DNT y GPC. | ADR 051 |
| Panel del fundador | Sólo emails verificados en una lista del servidor; 403 para el resto. | `smoke:dashboard` |
| Cabeceras | CSP estricta sin inline ni eval (verificada con el recorrido completo sin errores de consola), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. | `infra/nginx.conf`, `infra/DEPLOY.md` |
| Contenedores | Gateway sin root, filesystem de sólo lectura, sin capabilities, `no-new-privileges`, con límites de CPU, memoria y procesos. Base y gateway sin puertos publicados. | `infra/compose.prod.yml` |
| IP detrás de proxy | `real_ip` en nginx y `DIAGRAMIA_TRUST_PROXY` en el gateway. El gateway avisa si se arranca con cuentas y sin esa variable. | Prueba con dos clientes |
| Migraciones | Checksum independiente del fin de línea, `.gitattributes` con LF, y vuelta atrás probada. | ADR 055, `migrations.test.ts` |
| Retención y borrado | Respuestas de IA: 24 h. Recibos: 90 días. Sesiones vencidas: se purgan. La eliminación de cuenta borra todo lo propio y desvincula la telemetría, sin tocar a otras cuentas con el mismo ID de documento. | ADR 056, `smoke:repository` |
| Contenido del modelo | La IA sólo propone acciones; el engine valida. Sin `eval` ni HTML ejecutable. Los SVG con script se rechazan. | Invariantes de `AGENTS.md`, smoke |

## Endurecimiento del 09/10/2026 (ADR 094)

| Área | Estado | Evidencia |
|---|---|---|
| Página de pago | Paddle.js sólo se carga en `/pago.html`, con CSP propia (orígenes de Paddle para script, estilos y marco). El editor y la landing conservan `script-src 'self'`. La clave de API y el secreto del webhook nunca llegan al navegador; sólo el token público. | Sonda con Chrome real contra el sandbox: 0 violaciones; `gateway.test.ts` |
| Redirección al pago | La dirección la fija el servidor y se valida dos veces (servidor y navegador): sólo se navega a la página de pago propia. El precio, la cuenta y el descuento se deciden en el servidor. | `billing.test.ts` |
| Frenos por ruta | Tope general por IP (600/min, sólo con IP real), inicio de sesión (30/min por IP), creación de pagos (6 cada 10 min por cuenta), guardados en la nube (240/min por cuenta) y avisos de Paddle (300/min por IP). Se suman a los de IA, eventos, contacto y vista previa. | `gateway.test.ts` |
| Degradación | Cobro u oferta mal configurados apagan esa parte y avisan en el log; el editor, la IA y la nube siguen. Una promesa suelta que falla no tira el gateway. | `apps/api/src/index.ts` |
| Editor | Un error al dibujar muestra una pantalla de recuperación (continuar, recargar, bajar copia) en lugar de una página en blanco. | Sonda con Chrome real |
| Landing | Los enlaces al editor se escriben en un archivo aparte (`links.js`); una falla de medición u oferta no los rompe. | `smoke:landing` |

Sin comprobar: los orígenes de Paddle en modo real (`buy.paddle.com`, `cdn.paddle.com`) se asumen simétricos a los del sandbox; verificar con el primer pago real mirando la consola. El tope general por IP no reemplaza un límite en el proxy del VPS ante un ataque volumétrico.

## Auditoría del 12/10/2026 (ADR 098–099)

Revisión del gateway, el cobro, el login, la configuración de nginx y el frontend antes de cobrar de verdad. `npm audit`: 0 vulnerabilidades (producción y desarrollo). Historial de Git sin claves (patrones de Paddle, OpenAI, Anthropic, AWS, GitHub, Slack, claves privadas y secretos de variables).

| Hallazgo | Gravedad | Corrección | Evidencia |
|---|---|---|---|
| **El gateway se podía dejar sin responder con la vista previa de enlaces.** El `<head>` de la página visitada se leía con expresiones regulares de costo cuadrático: una página de 256 KB armada a propósito ocupaba el único hilo unos 10 s por pedido (medido), y una sola cuenta gratuita podía repetirlo 10 veces por minuto. | Alta | Lectura lineal con tope de largo por etiqueta y de etiquetas revisadas; entidades y texto acotados. | `linkPreview.test.ts`: siete páginas hostiles en menos de 1 s cada una |
| **Los límites por IP se multiplicaban con IPv6.** Cada dirección de un /64 contaba como un cliente distinto, y con más de 10.000 claves vigentes el limitador recorría todo su mapa en cada pedido. Hoy el dominio no publica IPv6; quedaría expuesto al activarlo. | Media | Los límites agrupan IPv6 por /64 y la poda del limitador corre a lo sumo cada 5 s. | `gateway.test.ts`, `billing.test.ts` |
| **El inicio de sesión se podía bloquear para todos.** Con 1.000 inicios pendientes, los nuevos se rechazaban durante 10 minutos; cuatro direcciones alcanzaban para sostenerlo. | Media | Tope de 5.000 y, lleno, se descarta el más viejo en lugar de rechazar el nuevo. | `oidc.test.ts` sigue aprobando |
| **Rutas internas publicadas.** `/api/v1/documents` (token del servidor, acceso a cualquier documento por ID) y `/api/v1/local` eran alcanzables desde internet a través de nginx. No había forma de usarlas sin el token, pero un token filtrado exponía todos los diagramas. | Media | nginx responde 404 a ambas; siguen disponibles sólo dentro de la red del servidor. | Ensayo de producción local |
| **Una suscripción vieja podía quitar un Pro pago.** Si una cuenta tenía una suscripción vencida y pagaba otra, la cancelación definitiva de la primera pisaba a la vigente. | Media (cobro) | Un aviso de otra suscripción no modifica la que hoy da Pro; queda una línea en el log para revisar el posible cobro doble. | `smoke:repository` |
| **Se podía eliminar la cuenta con un cobro pendiente.** Con la suscripción vencida o en pausa la cuenta figura Free, se dejaba eliminar y Paddle seguía reintentando el cobro. Además, en ese estado la cuenta no mostraba cómo cambiar el medio de pago ni cancelar. | Media (cobro) | La eliminación exige cancelar toda suscripción viva; la cuenta muestra «Cambiar medio de pago» y «Cancelar suscripción» también con el cobro vencido. | `smoke:repository` |
| **Pagos de prueba que seguirían dando Pro al cobrar de verdad.** Las suscripciones del sandbox no se distinguían de las reales. | Media (cobro) | Cada suscripción guarda su entorno (migración 009) y, en `live`, las de prueba se quitan al arrancar. | `smoke:repository` |
| Un token con caracteres de varios bytes del mismo largo que el real hacía fallar la comparación y respondía 500 en lugar de 401. Sin fuga ni acceso. | Baja | La comparación usa el largo en bytes. | `gateway.test.ts` |
| Los enlaces de gestión que llegan en los avisos de Paddle se guardaban con cualquier esquema. Vienen firmados, pero terminan como enlaces en la cuenta. | Baja | Sólo se guardan si son `https`. | `billing.test.ts` |

**Revisado sin hallazgos:** aislamiento de documentos por proyecto, CSRF (header propio con preflight, cookie `SameSite=Lax`), verificación de firma y antigüedad del webhook, redirecciones del login y del pago (sin redirección abierta), protección SSRF de la vista previa (direcciones mapeadas y redirecciones incluidas), ausencia de HTML del modelo en el editor (sin `dangerouslySetInnerHTML`; el Markdown propio no interpreta HTML), enlaces de nodos sólo `http(s)`, secretos fuera del bundle y de las imágenes.

**Riesgos que quedan y por qué:**

- **Enlace de pago ajeno.** Quien recibe un enlace `pago.html?_ptxn=…` creado por otra cuenta pagaría el Pro de esa cuenta. No se ata el enlace al navegador que lo creó porque Paddle usa el mismo formato en sus correos de recuperación y en «Cambiar medio de pago». El importe y el destinatario se ven en el formulario de Paddle.
- **HSTS sin `includeSubDomains`** y terminación TLS: los pone el proxy del VPS (carpeta de ReservApp), fuera de este repositorio.
- **Contenedor `web`:** nginx corre con las capacidades por defecto de la imagen oficial; el gateway sí corre sin root, sin capacidades y con sistema de archivos de sólo lectura.
- **Ataque volumétrico:** los límites del gateway viven en memoria de un proceso; no reemplazan un límite en el proxy del VPS o un servicio delante.
- **Reembolsos y contracargos:** el gateway sólo procesa avisos de suscripción. Un reembolso hecho en Paddle no baja el plan hasta que la suscripción se cancele.
- **Textos legales:** privacidad, términos y reembolsos se publican como definitivos desde el 13/10/2026 (ADR 100), en español e inglés, sin revisión profesional; Paddle los revisa para aprobar la cuenta real.

## Pendiente antes de lanzar

- **Auth0 real:** configurar el tenant, exigir el email verificado, revisar la pantalla de login con la marca y probar el login completo en HTTPS.
- **Privacidad y textos legales:** `privacidad.html`, `terminos.html` y `reembolsos.html` tienen los datos completos (08/10) y se publican sin el cartel «Borrador» por decisión del usuario (13/10, ADR 100), con versión en inglés (`privacy.html`, `terms.html`, `refunds.html`). La revisión profesional sigue sin hacerse. Decidir sobre el consentimiento de visitantes de la UE (ADR 051). Retención mínima y eliminación de cuenta ya implementadas (ADR 056).
- **Licencia del código:** el repositorio es público y todavía no tiene licencia elegida (ADR 043).
- **Alerta de gasto:** fijar `DIAGRAMIA_ALERT_WEBHOOK_URL` en producción (guía, paso 5).
- **Revisión externa:** al tener tráfico real o antes de cobrar, una revisión independiente de autenticación y del MCP remoto.
- El endpoint de eventos acepta pedidos sin header `Origin` (scripts). El límite por IP y el contrato cerrado acotan el daño a **ensuciar métricas**. Si pasa, filtrar por IP o exigir un token por sesión anónima.
