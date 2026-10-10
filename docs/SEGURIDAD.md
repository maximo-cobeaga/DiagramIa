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

## Pendiente antes de lanzar

- **Auth0 real:** configurar el tenant, exigir el email verificado, revisar la pantalla de login con la marca y probar el login completo en HTTPS.
- **Privacidad:** completar y hacer revisar el borrador `apps/editor/public/privacidad.html`, y decidir sobre el consentimiento de visitantes de la UE (ADR 051). Retención mínima y eliminación de cuenta ya implementadas (ADR 056).
- **Licencia del código:** el repositorio es público y todavía no tiene licencia elegida (ADR 043).
- **Alerta de gasto:** fijar `DIAGRAMIA_ALERT_WEBHOOK_URL` en producción (guía, paso 5).
- **Revisión externa:** al tener tráfico real o antes de cobrar, una revisión independiente de autenticación y del MCP remoto.
- El endpoint de eventos acepta pedidos sin header `Origin` (scripts). El límite por IP y el contrato cerrado acotan el daño a **ensuciar métricas**. Si pasa, filtrar por IP o exigir un token por sesión anónima.
