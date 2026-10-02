# Cuenta y documento compartido

## Qué se implementó

El editor conserva el borrador en el navegador. Si se activa PostgreSQL, puede guardar una pestaña en un espacio local compartido con MCP. Con un proveedor OIDC configurado, una cuenta obtiene un proyecto privado y guardado en la nube. Cada cambio usa un lote del core, revisión optimista y un recibo durable; al reconectar se compara la revisión antes de aceptar datos remotos. Un conflicto conserva la copia local y ofrece descargarla antes de recuperar el servidor.

El proveedor elegido para el primer MVP es **Auth0 Universal Login**, mediante el protocolo OIDC y `openid-client` 6.8.8 (MIT). El backend también acepta otro issuer OIDC compatible. El secreto de cliente y el token interno de documentos quedan sólo en el servidor. Se probaron PKCE, state, nonce, enlace de flujo al navegador, firma del ID Token, callback por el proxy y rechazo de respuestas repetidas con un issuer de prueba. **No hay tenant ni credenciales reales de Auth0 en este proyecto**, por lo que el login externo aún necesita su prueba manual.

## Probar el espacio compartido local

1. Ejecutar `npm run db:up`.
2. Configurar en `.env` `DIAGRAMIA_DATABASE_URL=postgresql://diagramia:diagramia-local-only@127.0.0.1:5433/diagramia`, ajustando contraseña y puerto si se cambiaron. Configurar `DIAGRAMIA_DOCUMENTS_TOKEN` con un secreto local y `DIAGRAMIA_LOCAL_WORKSPACE=1`.
3. Reiniciar el gateway con `npm run api` y levantar el editor con `npm run dev`. El proceso anterior del gateway no incorpora variables o código nuevos hasta reiniciarlo.
4. En el editor, abrir **Cuenta → Espacio compartido local → Compartir esta pestaña**. Editar y comprobar el estado de revisión. El borrador local sigue disponible para exportación.
5. Para MCP stdio sobre el mismo documento, configurar en el proceso del host `DIAGRAMIA_DOCUMENTS_URL=http://127.0.0.1:8787`, `DIAGRAMIA_DOCUMENT_ID` con el ID que muestra la lista, y `DIAGRAMIA_DOCUMENTS_TOKEN` con el secreto del gateway. `DIAGRAMIA_DOCUMENT` sigue sirviendo para el modo de archivo independiente.

El puente sin cuenta sólo escucha en loopback y se habilita expresamente. No usar `DIAGRAMIA_LOCAL_WORKSPACE=1` en una instalación pública.

## Activar cuentas OIDC

Crear una aplicación web regular en Auth0, habilitar Universal Login y registrar como callback exacto `http://127.0.0.1:5173/api/v1/auth/callback` para desarrollo. En `.env`, definir `DIAGRAMIA_OIDC_ISSUER` (`https://DOMINIO_AUTH0/`), `DIAGRAMIA_OIDC_CLIENT_ID`, `DIAGRAMIA_OIDC_CLIENT_SECRET`, `DIAGRAMIA_OIDC_REDIRECT_URI` con ese callback y `DIAGRAMIA_OIDC_HOME_URL=http://127.0.0.1:5173/`. Mantener PostgreSQL configurado y reiniciar el gateway. El botón **Cuenta → Iniciar sesión** abre el login del proveedor. La URI de retorno pública debe coincidir exactamente con la registrada; en producción requiere HTTPS, dominio y proxy configurados.

Auth0 documenta su [Universal Login para aplicaciones web](https://auth0.com/docs/quickstart/webapp/express/index); el flujo OIDC usa la [API oficial de openid-client](https://github.com/panva/openid-client/blob/main/docs/README.md). La cuenta crea un proyecto privado; otro usuario recibe 404 al intentar leer o escribir sus documentos, incluso si ambos usan el mismo ID semántico. La sesión opaca se guarda como hash en PostgreSQL, vence a los 30 días y se envía en cookie HttpOnly/SameSite. Cerrar sesión invalida la fila.

El plan Free aplica en el servidor 3 diagramas, 10 MB por diagrama con versiones y 30 MB por cuenta. La IA exige cuenta cuando OIDC está configurado: 20 créditos mensuales, máximo 6 diarios, 2 por Crear y 1 por los otros modos. Los recibos de crédito y respuestas son durables e idempotentes; el presupuesto global de tokens/USD y el rate limit del gateway siguen cortando llamadas antes del proveedor. Sin OIDC, el gateway continúa en modo de desarrollo local para probar modelos, sin afirmar que sea IA Free publicada.

## Verificación y límites

- `npm run check`: build y pruebas de core, interop, gateway, OIDC y MCP.
- `npm run smoke:repository`: dos PostgreSQL Docker aislados; cuentas A/B, sesiones vencidas, cuotas, CAS y recuperación por backup.
- `npm run smoke:shared`: Chromium real con PostgreSQL efímero; MCP→editor, editor→MCP, undo durable, guardado en cuenta y reconexión tras recargar.
- `npm run smoke`: exporta PDF del diagrama y PDF de presentación, además de los recorridos anteriores.

Faltan un proveedor Auth0 real configurado, prueba manual con dos dispositivos, prueba de MCP remoto con Auth0 y hosts externos, almacenamiento S3/jobs y facturación/BYOK. MCP remoto ya está implementado y probado con un issuer local firmado; ver `docs/MCP_REMOTO.md`. El PDF es una imagen rasterizada de cada vista; el JSON conserva la edición completa. No publicar el plan Free ni activar cobros hasta medir costo real y completar la operación de producción.
