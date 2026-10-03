# Estado de desarrollo

## Último checkpoint

03/10/2026 (Argentina, UI y animación simplificada; ADR 069). Se implementó el alcance pedido en P8.1/P2.1:
- **Lienzo prioritario:** animación plegada al abrir, reproductor de 77 px y lienzo de 619 px en 1440×900. Reproducir, pausar y avanzar quedan disponibles. «Editar pasos» abre el panel; «Bajar panel», arrastre del borde o End lo pliegan. Flechas ajustan la altura; el foco vuelve al botón al plegar con teclado.
- **Edición simple:** tarjetas numeradas, texto, duración en segundos, enfoque y transición. Editar pausa la reproducción. Pistas, estados, escenarios y encuadres conservados detrás de opciones avanzadas. Texto/duración siguen usando acciones canónicas y undo; altura/plegado no cambian el documento. Sin cambios de schema ni dependencias.
- **UI de marca:** superficies separadas y más aire, herramientas y paleta más legibles, «Tu lienzo» en lugar de metadatos técnicos, bienvenida del asistente y tutorial actualizados. Claro/oscuro, desktop/tablet/móvil comprobados.
- **Próximo paso inequívoco:** probar puntos 20–21 de `VALIDATION.md`, con énfasis en personas sin experiencia. P8.1 sigue parcial: falta usabilidad observada, lectores de pantalla y dispositivos físicos. Trabajo local, sin push ni despliegue.

03/10/2026 (Argentina, recuperación de la última sesión de Claude). Se completaron sus cambios pendientes y se atendió la aclaración del destino del viaje:
- **P2.3, extensión de cámara (ADR 067):** schema 1.7.0, migración aditiva con IDs y revisión conservados, enfoques por paso y transiciones suave/lenta/corte. Motor compartido por editor, presentación y PDF; prioridad de las pistas de cámara. Pausa, movimiento manual, reduced-motion y cámaras por pestaña comprobados.
- **P4.4, excepción de admin (ADR 068):** email verificado y configurado en el servidor; sin créditos Free ni límites por minuto de cuenta, IP o ledger. Recibos durables de cero créditos, migración SQL 006 registrada y reintentos idempotentes. Se conservan los topes globales de tokens y gasto. La cuenta admin local está configurada y verificada; no se hizo una llamada de IA paga en esta recuperación.
- **Viaje de 10 días:** ejemplo editable «San Pancho · viaje de 10 días», desde Mar del Plata hacia San Francisco/San Pancho, Nayarit. 29 elementos, seis zonas, tres fechas, itinerario, presupuesto separado en ARS/MXN y recorrido de cámara. Fuentes y supuestos en `docs/VIAJE_SAN_PANCHO.md`; no son cotizaciones confirmadas ni reservas.
- **Cierre local:** gateway habitual reiniciado con código actualizado y migración aplicada; editor habitual conservado. Sin push ni despliegue. Próxima comprobación manual: puntos 17–19 de `VALIDATION.md`.

03/10/2026 (Argentina, tercera vuelta). Se retomó la sesión anterior y se avanzó con lo que no depende de accesos externos:
- **Commit pendiente resuelto:** `.env.example` volvió al estado de `HEAD` (tenía el secreto de Auth0) y el trabajo de la noche quedó en el commit local `710841e`, sin `.env` ni secretos (verificado en el diff).
- **Menos cruces entre zonas (P1.7, ADR 065):**
  - `ARRANGE_DOCUMENT` prueba también una disposición alrededor de la zona más conectada y se queda con la de menor costo.
  - Las capas se desenredan con barridos de baricentro.
  - Una curva que pisaría nodos elige otros lados y otra tensión.
  - Viaje `evi-2`: de 7 a 2 cruces y de 6 a 1 conexión sobre nodos. Checkout: de 6 a 2 y de 4 a 1.
- **Vista previa de enlaces (P1.7, ADR 066):**
  - `POST /v1/link-preview` con protección SSRF: sólo direcciones públicas, conexión a la IP validada, redirecciones revalidadas, 6 s, 256 KB y sólo HTML.
  - En Propiedades, «Traer título y descripción de la página» y «Usar como nombre y detalle», en un paso deshacible. Sin cambio de schema.
  - El aviso de privacidad lo menciona.
- **Pendiente (P1.7):** mapas reales (hay que elegir proveedor de teselas: costo, licencia, CSP y privacidad) y la revisión manual del usuario.

03/10/2026 (Argentina, noche, segunda vuelta). El usuario pidió **más estética, más variedad y una vista previa real**, y mostró un viaje que la IA armó sin diseño (`evidencias/evi-1.json`). Se hizo lo siguiente:
- **Formas y vista previa (ADR 062):**
  - 11 formas con diseño propio: nota adhesiva, tarjeta con encabezado, globo, píldora, avatar, insignia, cinta, carpeta, ventana, chevron y mapa.
  - 68 iconos y las categorías «Viajes y planes» y «Procesos».
  - El elemento real se ve bajo el cursor al ubicarlo y al arrastrarlo, y las miniaturas de la paleta son el nodo real.
  - Un detalle largo se parte en renglones en lugar de estirar el nodo.
- **Diseñador automático (ADR 063):**
  - Le pone a lo que crea la IA un tono por zona, formas por rol e iconos por significado.
  - Conexiones firmes dentro de una zona y suaves entre zonas.
  - Recorrido animado incluido.
  - Botón «✦ Darle diseño» para diagramas existentes: un solo paso, que se deshace con Ctrl+Z.
  - Distribución en grilla, filas de cinco y estantes.
- **Enlaces y mapa (ADR 064):** campo `link` (sólo http/https) con dominio visible y botón ↗; la forma mapa es una ilustración editable.
- **Resultado con el mismo pedido del usuario y DeepSeek:**
  - Antes: 35 notas iguales, 9 flechas y ninguna animación.
  - Ahora: 19 a 27 elementos en 3 a 5 formas, 17 a 21 iconos, zonas de color y un recorrido de 13 a 15 pasos. Capturas en `evidencias/`.
- **Pendiente (P1.7):** vista previa remota de enlaces (requiere protección SSRF), mapas reales y menos cruces entre conexiones de zonas distintas.

03/10/2026 (Argentina, noche). **Revisión manual del usuario (`revision-3-10.md`) aplicada**, en el orden pedido:
- **Acceso y chat (P8.5, ADR 057):**
  - «Iniciar sesión» visible en la cabecera y, ya dentro, el email con su inicial; la pestaña Sesión pasó a llamarse Cuenta y muestra la cuenta primero.
  - El botón del panel lateral es un ícono, y el logo apunta a la landing real (antes, a `localhost:4173`).
  - Tocar una observación de la IA enfoca y resalta el elemento con el color de su gravedad, sin seleccionarlo, y lo nombra por su nombre visible.
  - Chat sin selector de modos: el gateway deduce la intención por reglas, sin costo, y se puede corregir con «Lo tomé como».
  - Respuestas breves y simples, con «Explicar más» (1 crédito).
  - Las acciones de una propuesta se describen en palabras, y el chat se rediseñó: envío dentro del cuadro e invitación a entrar.
- **Explicación animada (P2.5, ADR 058):** explicar trae un recorrido de pasos sobre elementos reales, que se ve como presentación sin guardarse y se puede guardar como animación. En toda presentación, un paso sin frame acerca la cámara a lo resaltado.
- **Elementos para todo público y propios (P1.6, ADR 059–060):**
  - Schema 1.6.0: iconos de 10 a 49 y `iconSize: large`.
  - Paleta con Ideas y notas, Personas, Negocio, Educación, Comunicación y tecnología, y Lugares y tiempo, con buscador.
  - 12 estilos de un toque, y selector de iconos en grilla.
  - «Guardar como elemento propio» en Propiedades; «Mis elementos» con miniaturas, que se insertan agrupados.
  - La IA puede usar los iconos al crear.
- Quedan registradas para después del lanzamiento la voz Premium (P2.6) y la biblioteca de la comunidad (P4.7).

**Atención:** el usuario cargó el Client ID y el Client Secret de Auth0 en `.env.example`, que está versionado (el repositorio es público). No se hizo commit. Antes de cualquier commit hay que dejar `.env.example` como en `HEAD` (`git checkout -- .env.example`); los valores reales ya están en `.env`.

03/10/2026 (Argentina, tarde). **IA real con DeepSeek como proveedor provisorio** mientras no haya clave de OpenAI. Se usa el adaptador compatible existente (`DIAGRAMIA_COMPAT_*`, modelo `deepseek-flash` = DeepSeek-V4.1-Flash, `https://api.deepseek.com`) y `DIAGRAMIA_ACCOUNT_PROVIDERS=compatible`. `npm run smoke:ai -- compatible`: **7/7** (Editar 2,8 s, Explicar, Revisar, ambigüedad, zona homónima, Crear 4 nodos/3 conexiones/0 superposiciones), 6 pedidos, 68.569 tokens de entrada (51.200 de caché) y 3.101 de salida. `npm run doctor` ahora muestra un aviso, no un error, cuando en local sólo hay un proveedor compatible. **Límite:** sin tarifa cargada, el tope en USD del gateway no cubre a DeepSeek; sólo lo frena el tope diario de tokens (400.000) y el saldo prepago de DeepSeek. Esto no verifica P3.1 con Luna: al tener `OPENAI_API_KEY`, borrar las líneas de DeepSeek de `.env`.

Además, **Auth0 real configurado y probado por el usuario** (P4.1): PostgreSQL local, tenant Auth0, login con email y contraseña, y `npm run doctor -- --online` sin problemas. La prueba encontró un bug de UX: la verificación del email sólo se lee al iniciar sesión, y quien verificaba después quedaba bloqueado sin forma clara de salir. Se agregó el botón «Ya lo verifiqué» en la cuenta y en el error del chat, que vuelve a pasar por Auth0 sin pedir contraseña. Comprobado en la base: `email_verified` pasó a `true` con el segundo inicio de sesión. `npm run check` 104/104. La revisión manual del usuario está en `revision-3-10.md`.

03/10/2026 (Argentina). Preparación de lanzamiento sin depender de accesos externos:
- **`npm run doctor`:** diagnóstico de configuración en castellano, también para `.env.production` y con pruebas reales de OpenAI y Auth0 (`--online`).
- **Alertas de gasto por webhook:** ntfy, Discord o Slack.
- **Retención mínima:** respuestas de IA borradas a las 24 h, recibos a los 90 días y sesiones vencidas. Además se corrigió un reintento que, sin respuesta guardada, habría podido llamar gratis al proveedor.
- **Eliminar mi cuenta** con confirmación escrita, y el estado de verificación del email visible en la cuenta.
- **Borrador de aviso de privacidad** (`/privacidad.html`), con datos legales `[COMPLETAR]`.
- **Comprobación automática de nombres accesibles** en el smoke.
- **`docs/GUIA_PASO_A_PASO.md`:** lo que tiene que hacer el usuario, explicado para principiantes.
- `docs/Estado_Diagramia_MVP.docx` regenerado (una página, verificado con Word).

Sin push ni despliegue.

02/10/2026 (Argentina, noche). Se ejecutó el bloque «antes del lanzamiento» del plan Lean salvo lo bloqueado por credenciales:
- **P3.1:** adapter GPT-6 Luna, más proveedores por plan.
- **P7.1–P7.3:** telemetría propia, métricas de IA con 👍/👎 y dashboard del fundador.
- **P4.4:** antiabuso (email verificado, límites por IP y por cuenta, tope mensual y alerta).
- **P8.2:** el ruteo bajó a un tercio del tiempo con rutas idénticas.
- **P8.3:** revisión de seguridad; se corrigió el checksum de migraciones, que dependía del fin de línea.
- **P8.4:** imágenes, compose de producción y runbook, probados en Docker local con vuelta atrás.

Resultado: `npm run check` **102/102** y todos los smokes aprobados. **No se desplegó** ni se usó ningún proveedor pago: faltan `OPENAI_API_KEY`, el tenant de Auth0, la autorización y acceso al VPS, y el dominio. Commits locales en `main`, sin push.

02/10/2026 (Argentina, planificación). El usuario retiró Higgsfield del producto, eligió **GPT-6 Luna** (`gpt-6-luna`, OpenAI) como IA del plan Free, confirmó Auth0 en lugar de Firebase, telemetría propia en PostgreSQL y un orden Lean de ejecución a partir de `DIAGRAMIA_SESION_PRODUCTO_NEGOCIO.md` (ADR 044–048). La fase P7 pasó a ser **Medición y aprendizaje**; P4.4 se redefinió como Free/cuotas/antiabuso y se agregó P4.6 (billing). Sin cambios de código: `npm run check` 88/88 al inicio de la sesión.

02/10/2026 (Argentina). El proyecto se publicó por instrucción del usuario en el repositorio GitHub público `maximo-cobeaga/DiagramIa`, rama `main`. El primer CI reveló un orden de build incorrecto en `smoke:repository`; se corrigió también `smoke:shared`. La ejecución del commit `65baaf9` pasó ambos jobs (`check` y `database`) en GitHub Actions; P4.5 quedó verificada. Esto publica el código, **no despliega la aplicación** ni completa el MVP. El siguiente bloque de producto continúa siendo P4.3.

01/10/2026 (Argentina, continuación). Se implementó P5.2: MCP remoto Streamable HTTP con OAuth, autorización por cuenta/proyecto y scopes, conservando stdio. También está implementada P6.3 con import/export PlantUML y BPMN; P4.1, P5.1 y partes de P4.4/P6.4 venían de la sesión anterior. El primer MVP **no está completo**: faltan prueba con Auth0 y hosts MCP reales, P4.3, resto de P4.4/P6.4, P5.3 y cierre de P8. Ver estados por microfase en `BACKLOG.md` y `docs/development-plan.json`.

## Evidencia

- **03/10/2026 (UI, ADR 069).** `npm run check` **123/123** y `npm run smoke` **41/41**. Chromium: reproductor compacto, altura con mouse/teclado, foco recuperado, plegado mientras sigue reproduciendo y documento intacto; edición con teclado real de texto y 2,5 segundos, dos undo que restauran el paso. Cámara, pistas, escenarios, exports, guardado, claro/oscuro, nombres accesibles, tablet y móvil siguen pasando, sin errores de consola. Capturas revisadas y conservadas en `evidencias/ui-editor-compacto.png` y `evidencias/ui-animacion-simple.png`. Logs locales `state/ux-check.log` y `state/ux-browser.log`. Las primeras corridas detectaron una colisión de claves React en opciones avanzadas (corregida) y supuestos viejos de los tests sobre campos siempre visibles; la corrida final pasó completa.

- **03/10/2026 (recuperación Claude).** `npm run check` **123/123**, `npm run schemas` y `npm run smoke:repository` aprobados. PostgreSQL real: cero créditos para admin, más de seis solicitudes, reintentos tras recrear el repositorio y backup/restore. `npm run smoke` **39/39** en Chromium contra editor/gateway de demostración aislados (5174/8788), sin errores de consola. Capturas 21–24 de `state/smoke/` revisadas; foco, pausa, cámara manual, reduced-motion, presentación, pestañas y ejemplo San Pancho. La corrida final se ejecutó después del build para evitar interferencia de HMR. Logs locales: `state/resume-check.log`, `state/resume-repository.log`, `state/resume-browser.log`.

- **03/10/2026 (tercera vuelta).** `npm run check` **117/117**. `npm run smoke` **37/37** en Chromium contra editor y gateway de demostración aislados (5174/8788), con un paso nuevo que comprueba desde la UI el rechazo de un enlace a `127.0.0.1`. Vista previa real contra example.com, wikipedia.org y github.com. Capturas del editor con el viaje reacomodado y con la tarjeta de vista previa revisadas. `perf:core` sin cambios; peor caso nuevo, 16 zonas y 120 conexiones curvas entre zonas: 0,35 s para ordenar.

- **03/10/2026 (noche, segunda vuelta).** `npm run check` **110/110**: el test nuevo de diseño de un viaje cubre tonos, formas por rol, iconos, respeto de lo elegido por el modelo, recorrido y ausencia de superposiciones. `npm run schemas` regenerado. `npm run smoke` **36/36** en Chromium, contra un editor y un gateway de demostración aislados; ahora también comprueba la vista previa al ubicar y «Darle diseño». Se corrigieron selectores que contaban las miniaturas de la paleta como nodos y un desborde de 2 px en el celular. Prueba real con DeepSeek, cuatro corridas del pedido «Planificame un viaje a Mar del Plata de 10 días»: 18–26 s y unos 19.000–20.000 tokens por pedido. Se revisaron capturas en cada corrida.

- **03/10/2026 (noche).** `npm run check` **109/109** (16 frases nuevas del clasificador de intención, recorrido de la explicación con IDs filtrados y migración 1.5.0→1.6.0). `npm run smoke` **36/36** en Chromium, contra un editor y un gateway de demostración aislados en 5174 y 8788. Tres comprobaciones nuevas: observación que enfoca sin seleccionar; explicación breve, animada, guardable y ampliable; elementos para todo público y elemento propio reinsertado agrupado. `npm run smoke:ai -- compatible` con DeepSeek real **9/9**: «¿Qué hace este diagrama?» se interpretó como explicación, con 73 palabras y un recorrido de 5 pasos válidos; «Explicar más» dio 180 palabras. Capturas 10, 17, 18 y 19 revisadas.

- **03/10/2026.** `npm run check` 104/104. `npm run smoke` 34/34 con el chequeo de nombres accesibles, que además se comprobó al revés: detecta un botón sin nombre inyectado. `smoke:repository` con PostgreSQL real: purga de respuestas, rechazo del reintento sin respuesta y eliminación de cuenta sin afectar a otras cuentas con el mismo ID de documento. `npm run doctor` probado en local, con el ejemplo de producción y dentro del contenedor `node:22.23.1-alpine`.

- **Sesión del 02/10 (noche).** Commits `099da82`…`74afa38`. `npm run check` 102/102.
  - Smokes con PostgreSQL Docker real:
    - `smoke:repository`: telemetría idempotente, vínculo anónimo→cuenta, email no verificado bloqueado y respaldo.
    - `smoke:shared`: Chromium + PostgreSQL, 11 eventos reales guardados sin título ni email.
    - `smoke:dashboard`: 10 indicadores iguales al cálculo manual, 403 a otras cuentas, vista sin desborde.
  - `npm run smoke` 33/33 tres veces: con el editor de desarrollo, con el build de producción y gateway de demostración (IA incluida), y contra el contenedor de producción con CSP estricta.
  - Pila de producción probada en Docker local: IP real a través de dos proxies, respaldo restaurado y vuelta atrás. Detalle en `infra/DEPLOY.md`.
  - Rendimiento medido en `docs/PERFORMANCE.md`.
  - La landing se verificó en Chrome headless: «Crear diagrama» lleva `aid`, `sid` y UTM.

- GitHub Actions en `65baaf9`: jobs `check` y `database` aprobados después de corregir el orden de compilación MCP→API en dos scripts de smoke. `npm run smoke:repository` también pasó localmente tras la corrección. El repositorio remoto y `main` apuntan al mismo commit antes de este registro documental.

- Informe breve para lectura: `docs/Estado_Diagramia_MVP.docx` resume estado, pendientes, decisiones abiertas y producto esperado en una página. Se generó con `scripts/create-status-doc.ps1`; Word lo abrió y contabilizó una página. No cambia el estado técnico de ninguna microfase.

- P5.2: `npm run check` **88/88**; `npm run smoke:mcp-remote` aprobado con issuer/JWKS firmado, PostgreSQL y cliente MCP reales; `npm run smoke:repository` aprobado después de integrar el gateway. Se comprobaron JWT/firma/expiración/audience, metadatos y desafío OAuth, Host/Origin, scopes, rol viewer, cuenta inexistente, dos proyectos y lectura/escritura. No hay evidencia de Auth0 o hosts externos reales; ver `docs/MCP_REMOTO.md`.

- P6.3: `npm run check` **88/88**; `npm run smoke` **33/33** en Chromium aislado. Importación UI de `.puml`/`.bpmn`, export de PlantUML/BPMN y pruebas core de referencias/DTD/round-trip. Los fixtures se validaron en el check final; el smoke se ejecutó antes del ajuste aislado de gateway paralelo, cubierto por test de contrato.

- Esta sesión: `npm run check` **82/82**; `npm run smoke:repository` y `npm run smoke:shared` aprobados contra PostgreSQL Docker efímero; `npm run smoke` **32/32** en Chromium, incluidos PDF del diagrama y presentación. OIDC se probó con issuer firmado de prueba; no se conectó Auth0 real. El smoke del navegador usa un perfil aislado y no modifica la sesión habitual del usuario. Se revisó visualmente `state/smoke/01-desktop-architecture.png` tras el cambio de cabecera; no se revisó todavía la cuenta en un navegador real con Auth0.

- `npm run check`: build de core, interop, providers, editor, MCP y API + **67 pruebas** aprobadas.
- `npm run schemas`: contratos regenerados para schema 1.3.0.
- `npm run smoke`: **30/30** en Chrome headless real contra el editor (y el gateway con proveedor de demostración), incluidas formas, texto en el lugar, estilos, enganches, pestañas, tema, tutorial y canvas visible en móvil. Capturas en `state/smoke/` (no versionadas), revisadas visualmente.
- `npm run smoke:ai -- local`: modo Crear real con 4 nodos, 3 conexiones y zona Backend pasó con validación estricta de relaciones y de `findOverlaps` completo; el recorrido terminó **6/7** porque el modelo pidió una aclaración innecesaria en un caso opcional de zonas homónimas. Dos corridas previas pasaron 7/7 con el criterio básico, y la prueba estricta descubrió y motivó la corrección de etiquetas sobre nodos. Es evidencia puntual, no tasa de fiabilidad.
- `npm run smoke:db`: respaldo custom y restauración entre dos instancias PostgreSQL Docker aisladas, con fila comprobada; también se probó `db:backup` a archivo local y `docker compose config -q`. CI de base agregado, no ejecutado en GitHub porque este árbol local no contiene `.git`.
- `npm run smoke:repository`: dos instancias PostgreSQL Docker aisladas, CAS concurrente, rollback, 105 versiones y eventos, recibos tras reinicio y después de 101 lotes, rutas HTTP con token y backup/restore de datos reales. CI remota aún no ejecutada.
- `npm run check`: **73/73** tras P6.2. `npm run smoke`: **30/30** en Chromium con editor aislado (IA omitida al no levantar gateway mock). Primer intento sin servidor falló en `about:blank`; se repitió correctamente.
- Corrección de `kind` en Crear tras reporte manual: `npm run check` **74/74**; prueba real del mismo pedido con qwen2.5-coder:7b en gateway aislado 8788: propuesta 200 en un intento, cuatro nodos canónicos y cinco conexiones. El gateway del usuario en 8787 permanece activo con el código anterior y debe reiniciarse.
- Cierre P2.4: `npm run schemas` para 1.5.0; `npm run check` **81/81**; `npm run smoke` **32/32** en Chromium. Se inspeccionó `state/smoke/16-desktop-login-tracks.png`: pistas abiertas y clips visibles. IA mock omitida en smoke porque el gateway no estaba levantado con `DIAGRAMIA_ENABLE_MOCK=1`.
- Detalle y límites en `VALIDATION.md`.

## Qué está listo

- **Core 1.7.0** (`packages/core`, en módulos): migraciones desde 1.0.0 hasta 1.7.0, iconos con tamaño grande, dibujos libres editables, pistas de resaltado/texto/cámara sincronizadas por paso, foco y transición por paso, acciones canónicas, formas y estilos editables, enganches libres en bordes y puntas/líneas, escenarios y estados, assets verificados, routing, layout con espacio para etiquetas, placement con colisiones, pertenencia a zonas, contexto por selección y biblioteca.
- **Editor** (`apps/editor/src`): stores separados, guardado recuperable, canvas editable, paleta de arquitectura/flujo/UML, texto en el lugar, inspector, timeline con grilla de pistas, presentación, biblioteca, chat de IA con staging, pestañas independientes, modo oscuro, panel plegable, tutorial y catálogo móvil plegable; import/export (JSON, Mermaid, SVG, PNG, Markdown, timeline).
- **Interop** (`packages/interop`): Mermaid, draw.io, DOT, PlantUML (clases/secuencia/estados simples), BPMN (proceso básico) y Markdown, con reportes de pérdidas.
- **IA** (`packages/providers`, `apps/api`): gateway, adapters GPT-6 Luna (structured outputs estrictos, costo con caché) / Claude / compatible OpenAI / demostración, proveedores por plan, modo Crear por inventario convertido a acciones del core, reparación acotada, presupuesto, rate limit, idempotencia y cancelación.
- **MCP**: lee versiones anteriores, anuncia capabilities, errores estructurados, contexto por selección.
- **Documentos backend (P4.2)**: repositorio PostgreSQL con migración versionada, CAS, versiones inmutables, restore, auditoría y recibos durables; rutas HTTP protegidas por token del servidor, activables con variables de entorno. `smoke:repository` prueba la recuperación en otra instancia.
- **Cuenta y proyecto (P4.1)**: login OIDC Authorization Code con PKCE, sesiones en PostgreSQL, proyectos privados, aislamiento A/B y cookies HttpOnly. Auth0 Universal Login configurado y probado por el usuario en local con email/contraseña y verificación; falta completar la revisión de proveedores de acceso y el entorno público de producción.
- **Documento compartido (P5.1)**: el editor se conecta por el gateway a documentos locales o de cuenta; MCP stdio usa la API con token sólo del servidor. Cola de cambios, recibos, revisiones, polling, restore/undo y recuperación de conflictos, probados en Chromium y PostgreSQL.
- **MCP remoto (P5.2)**: `/mcp` usa Streamable HTTP y OAuth bearer con JWT RS256/JWKS, audience exacta, scopes y autorización por proyecto. Los metadatos del recurso se publican para discovery. Probado localmente con cliente MCP oficial; la conexión externa requiere configurar issuer, audience, proxy y hosts.
- **Free y antiabuso (P4.4)**: 3 documentos, 10 MB por documento y 30 MB por proyecto, 20 créditos IA mensuales y 6 diarios por usuario. Además, email verificado, 20 pedidos/min por IP y 6 por cuenta, reserva USD de pedidos en curso, tope diario y mensual (20 USD) con alerta al 80 %. Pro, billing y BYOK pasan a P4.6.
- **Medición (P7.1–P7.3)**: contrato de eventos sin texto libre, ingesta `/v1/events`, cliente del editor con DNT/GPC y opt-out, landing con «Crear diagrama», `ai_request` del servidor, 👍/👎 con motivo, agregados diarios y `/#fundador` con los 10 indicadores. Ver `docs/TELEMETRIA.md`.
- **Privacidad y cuenta**: retención mínima, eliminación de cuenta, estado de verificación del email y borrador de aviso de privacidad enlazado desde la landing y el editor (ADR 056).
- **Operación**: `npm run doctor` y alertas de gasto por webhook.
- **Despliegue preparado (P8.4)**: `infra/Dockerfile`, `compose.prod.yml`, `nginx.conf`, `backup.sh` y `DEPLOY.md`, probados en local. Sin desplegar.
- **Export P6.4 parcial**: SVG, PNG y PDF estático; PDF multipágina de pasos de presentación. No exporta movimiento temporal ni video.
- **Interop P6.2**: import/export draw.io XML plano o comprimido y Graphviz DOT en subconjuntos editables, con límites, errores recuperables y reportes de pérdidas; también avisan que omiten trazos libres. Controles de import/export en editor. Mapping en `docs/INTEROP.md`.
- **Interop P6.3**: import/export PlantUML de clases, secuencia y estados simples, y BPMN de proceso básico no ejecutable; referencias válidas, geometría DI conservada cuando está completa y errores atómicos. Cuatro fixtures de importación en `examples/`.

## Qué está pendiente

- **Bloqueado por accesos externos:** smoke real de Luna y medición de costo, despliegue (P8.4) y hosts MCP (P5.3).
- **Antes de lanzar:**
  - completar y hacer revisar el borrador del aviso de privacidad, y decidir sobre el consentimiento en la UE;
  - licencia del código;
  - `DIAGRAMIA_ALERT_WEBHOOK_URL` en producción;
  - revisión manual del usuario de P1, P2, P4.1, P5.1, P6.3, P7 y P8.1, y de lo nuevo del 03/10: P1.6, P2.5 y P8.5;
- **Después de lanzar, según datos:** billing con Paddle (P4.6), agente Data/Product (P7.4), assets en almacenamiento (P4.3), export temporal (P6.4), recorte por viewport para más de 500 nodos, y CAPTCHA o señales de riesgo si aparece abuso.
- **Límite conocido:** el motor detecta las superposiciones modeladas, pero no garantiza que todas las curvas, rutas manuales o cruces entre conexiones queden libres.

## Bloqueos externos concretos

- **GPT-6 Luna (IA Free, P3.1):** falta `OPENAI_API_KEY` para el smoke real y la medición de costo. El adapter y sus pruebas de contrato no dependen de la clave.
- **Claude (alternativo, no bloquea):** falta `ANTHROPIC_API_KEY`. Con la key: crear `.env` en la raíz con `ANTHROPIC_API_KEY=...`, `npm run api`, y `npm run smoke:ai -- anthropic`. Si pasa, P3.1 queda verificada. El proveedor local ya se probó de verdad: `ollama serve` con `OLLAMA_CONTEXT_LENGTH=16384`, y en `.env` `DIAGRAMIA_LOCAL_BASE_URL=http://127.0.0.1:11434/v1`, `DIAGRAMIA_LOCAL_MODEL=qwen2.5-coder:7b`, `DIAGRAMIA_REQUEST_TIMEOUT_MS=420000`.
- Auth0: tenant, credenciales y callback local configurados; email/contraseña y verificación probados por el usuario. Falta revisar Google y callbacks de producción, junto con seguridad/release del entorno público.
- MCP remoto real: además de Auth0, faltan API/audience/scopes configurados, proxy HTTPS público y dos hosts OAuth compatibles. El flujo local firmado pasó; el interop externo y la reconexión corresponden a P5.3.
- Despliegue: los artefactos están listos y probados en local (`infra/DEPLOY.md`), pero faltan autorización, acceso al VPS, dominio y `.env.production` con secretos. No hay despliegue de la aplicación. El repositorio de código sí se publicó en GitHub por instrucción del usuario. No se activaron cobros ni servicios pagos.

## Próxima acción inequívoca

El próximo paso es probar la UI y animación simplificada: puntos 20–21 de `VALIDATION.md`. Recargar el editor habitual, reproducir desde la barra compacta, abrir «Editar pasos», cambiar texto/segundos y bajar el panel con botón o arrastre. Observar también a una persona sin experiencia y registrar dónde duda. Las revisiones de cámara, admin y viaje (17–19) siguen disponibles. Los pasos 2 (base local) y 3 (Auth0) de `docs/GUIA_PASO_A_PASO.md` ya están hechos. Para el agente:

0. **Antes de cada commit:** comprobar que `.env.example` no tenga valores reales (el usuario los cargó ahí una vez). El trabajo de esta sesión se commitea local, sin push.
0b. **Sin bloqueos, si el usuario lo decide:** mapas reales (P1.7). Requiere elegir proveedor de teselas (OpenStreetMap tiene política de uso que no admite tráfico intenso; MapTiler o Stadia son pagos por volumen), ajustar la CSP `img-src` y decidir si el navegador del usuario pide las teselas directo (el proveedor ve su IP) o pasan por el servidor.

1. **Con `OPENAI_API_KEY`:** `npm run api` y `npm run smoke:ai -- openai`. Repetirlo con `DIAGRAMIA_OPENAI_REASONING_EFFORT` en none, low y medium, y registrar costo por pedido, latencia y calidad. Con eso P3.1 queda verificada y se ajustan los créditos Free.
2. **Auth0 ya conectado:** completar la revisión de Google y callbacks de producción (P4.1); el admin local ya tiene email verificado y está en `DIAGRAMIA_ADMIN_EMAILS`.
3. **Con autorización, VPS y dominio:** seguir `infra/DEPLOY.md` (P8.4), con respaldo diario por cron y la alerta de gasto conectada.
4. **Sin bloqueos:** revisión manual del usuario (`VALIDATION.md`, `docs/CUENTA_Y_COMPARTIDO.md`, `/#fundador`), y el texto del aviso de privacidad y la licencia.

## Servicios externos

Ninguno es necesario para levantar el editor. El gateway de IA sólo llama a un proveedor si su credencial está en el entorno del servidor (`.env` en la raíz, ignorado por Git). Nunca usar prefijo `VITE_` para claves.

## Registro por sesión

| Fecha | Microfases | Cambios | Pruebas | Siguiente |
|---|---|---|---|---|
| 30/09/2026 | — | Paquete inicial | 14 tests (Linux) | P0.1 |
| 01/10/2026 | P0.1–P0.3, P1.1–P1.5, P2.1, P2.3, P2.4, P3.1–P3.5, P6.1, P6.4 | Core 1.1.0 modular, editor reescrito en módulos, interop, providers, gateway, smoke en navegador. Corregido bug del starter: `UPDATE_NODE` parcial borraba zona y subtítulo. ADR 013–019 | check: 40/40; smoke: 23/23; schemas regenerados | Revisión manual; smoke real de IA; P2.2 |
| 02/10/2026 | P2.2, P1.3, P1.2 (marcadores), P3.4 | Schema 1.2.0: escenarios y estados, assets e iconos, anotaciones; UI de timeline por rama, alta de imágenes, anotaciones en inspector y desde Review. Ejemplo de rechazo con dos ramas. ADR 020–022. Corregida una carrera al soltar el mouse en gestos del canvas | check: 45/45; smoke: 26/26 en 4 corridas seguidas tras corregir una carrera real en los gestos del canvas (antes fallaba 2 de 7); schemas regenerados | Revisión manual; smoke real de IA; P4.5/P4.2 |
| 02/10/2026 | Cierre de P3 | Chat con historial, vista previa de propuestas en el canvas paso a paso, consumo del día, zonas homónimas resueltas por código, modo JSON nativo en el adapter local, herencia de zona en placement relativo, `npm run smoke:ai`. ADR 023–026 | check: 51/51; smoke: 27/27; smoke:ai local: 6/6 ×3 con qwen2.5-coder:7b (antes del endurecimiento: 3–4 de 5) | Smoke con Claude al tener la key; P4.5 → P4.2 |
| 01/10/2026 (continuación) | Extensión P1.1/P1.2/P1.4 y P8.1 parcial | Recuperado trabajo inconcluso de Claude: schema 1.3.0, formas/estilos/enganches, pestañas, tema, chat, tutorial. Corregidos lote de 200 acciones truncado, geometría inválida del modelo, modo Crear por inventario, espacio de etiquetas y catálogo móvil. ADR 027–029. Fechas previas se conservan como las anotó el agente anterior | check: 66/66; schemas 1.3.0; smoke: 30/30; smoke:ai local estricto: 6/7 (6 obligatorias, 1 nota del modelo) | P4.5; revisión manual; smoke Claude con key |
| 01/10/2026 (continuación) | P4.5 parcial | Compose PostgreSQL 17.11-alpine con healthcheck/volumen loopback, backup local atómico, restauración comprobada en DB aislada, `/ready` y logs HTTP sin contenido, job CI de DB. ADR 030 | check: 67/67; smoke:db real aprobado; backup a archivo válido; compose config válido. CI remota no ejecutada | P4.2, luego cerrar P4.5 con datos reales |
| 01/10/2026 (continuación) | P4.2 y P4.5 implementadas | Repositorio `pg` con migración checksum, CAS, versiones, restore, recibos y auditoría; rutas de documentos con token exclusivo del servidor; readiness de DB y CI de backup/restore. ADR 031 | check: 67/67; smoke:repository real aprobado con carrera, rollback, 101 lotes, reinicio, HTTP y restauración entre dos DB. CI remota no ejecutada | P5.1 y P6.2; revisión manual del editor |
| 01/10/2026 (continuación) | P6.2 implementada | Import/export draw.io y DOT con parser seguro, límites y reporte de pérdidas; UI de archivos y exports. ADR 032 | check: 73/73; smoke: 30/30 en Chromium (IA mock omitida); pruebas de XML comprimido, DTD, grupos aplanados y DOT | P5.1; revisión manual con archivos variados |
| 01/10/2026 (prueba manual) | Corrección P3.4 Crear | El prompt enumera `kind` válidos y el gateway normaliza alias semánticos cerrados; tipos desconocidos siguen rechazados. ADR 033 | check: 74/74; prueba real local: 200, 4 nodos, 5 conexiones, 0 reparaciones | Reiniciar gateway 8787 y repetir en editor; registrar resultado |
| 01/10/2026 (continuación) | UX de animación y trazos libres; decisiones de MVP registradas | Acciones visibles «Crear animación», «Crear recorrido», «Agregar paso»; ajustes avanzados bajo desplegable. Herramientas Línea/Flecha/Dibujar; trazos seleccionables, movibles, eliminables y exportables a SVG. Schema 1.4.0, migración, JSON Schemas, ejemplos actualizados y ADR 034. Decisiones de cuenta/nube/IA anotadas para P4.1/P4.4; no se activaron auth ni cobros. | `npm run check`: 77/77; `npm run schemas`; `npm run smoke`: 31/31 Chromium (IA omitida porque el gateway no tiene proveedor mock). Selector antiguo del smoke corregido antes de la corrida final. | Prueba manual de dibujo/animación; seguir P2.4 (tracks) y elegir proveedor OIDC para P4.1 |
| 01/10/2026 (continuación) | P2.4 implementada | Schema 1.5.0 y migración aditiva; pistas de resaltado, texto y cámara ligadas a IDs de paso, poda con aviso, ramas, grilla editable, plantilla de login, export timeline y Markdown, ADR 035. Cuatro ejemplos y JSON Schemas actualizados. | `npm run check`: 81/81; `npm run schemas`; `npm run smoke`: 32/32 Chromium (IA mock omitida). Captura 16 revisada. | Revisión manual de pistas; P5.1, o P6.3 como bloque independiente |
| 01/10/2026 (continuación) | P4.1/P5.1 implementadas; P4.4/P6.4 parciales | OIDC Auth0 por protocolo estándar, proyectos y sesiones privadas, cuotas Free y créditos durables; documentos compartidos entre editor/MCP con CAS, polling y recuperación de conflicto; PDF del diagrama y presentación. Aislamiento adicional de rutas locales frente a documentos de cuenta. ADR 036–040. | `npm run check`: 82/82; `npm run smoke:repository` y `smoke:shared` con PostgreSQL Docker; `npm run smoke`: 32/32 Chromium. OIDC sólo con issuer de prueba. | P5.2; prueba manual de cuenta real/entre dispositivos; P4.3 y P6.3 |
| 01/10/2026 (continuación) | P6.3 implementada | PlantUML clases/secuencia/estados y BPMN proceso básico con import/export, informes de pérdidas, IDs/referencias y geometría BPMN DI. Cuatro ejemplos y ADR 041. | `npm run check`: 88/88; `npm run smoke`: 33/33 Chromium, incluido import/export desde UI. | P5.2 o P4.3; revisar archivos UML/BPMN externos variados |
| 01/10/2026 (continuación) | P5.2 implementada | MCP remoto Streamable HTTP y OAuth resource server, JWT RS256/JWKS, scopes read/write, audiencia exacta y autorización por proyecto; ADR 042 y guía `docs/MCP_REMOTO.md`. | `npm run check`: 88/88; `npm run smoke:mcp-remote` y `npm run smoke:repository` aprobados. Issuer/JWKS local firmado, sin Auth0 ni host externo. | P4.3; prueba real de Auth0/proxy/hosts y P5.3 |
| 02/10/2026 (planificación) | Plan reordenado; P4.4, P4.6 y P7 redefinidas | Higgsfield retirado del producto, GPT-6 Luna para Free, Auth0 confirmado, telemetría propia y orden Lean. ADR 044–048; `development-plan.json`, plan, backlog y criterio A16 actualizados; `07_IA_MCP_HIGGSFIELD.md` renombrado a `07_IA_Y_MCP.md`. | `npm run check` 88/88 (sin cambios de código) | P3.1 adapter Luna; P7.1 eventos |
| 02/10/2026 (noche) | P3.1 (adapter), P4.4, P7.1–P7.3 implementadas; P8.2 implementada; P8.3/P8.4 parciales | Luna con structured outputs, proveedores por plan, telemetría propia y dashboard, antiabuso, ruteo con grilla espacial y poda exacta, checksum de migraciones por LF, artefactos de despliegue. ADR 049–055 | check 102/102; smoke 33/33 ×3 (dev, build prod, contenedor prod); smoke:repository, smoke:shared, smoke:dashboard; prueba de pila prod con respaldo y vuelta atrás | Credenciales (OpenAI, Auth0), autorización de despliegue, revisión manual |
| 03/10/2026 (3.ª vuelta) | P1.7 avanza (sigue parcial) | Commit del trabajo anterior sin secretos; menos cruces entre zonas, capas desenredadas y curvas que rodean nodos; vista previa de enlaces con protección SSRF. ADR 065–066 | check 117/117; smoke 37/37; cruces medidos en evi-2 y checkout; vista previa contra sitios reales | Revisión manual (puntos 15–16); decidir proveedor de mapas; Luna con clave |
| 03/10/2026 (noche, 2.ª vuelta) | P1.6 ampliada; P1.7 parcial | Formas con diseño propio, vista previa real, diseñador automático con recorrido, «Darle diseño», distribución nueva, enlaces y mapa. ADR 062–064 | check 110/110; smoke 36/36; 4 corridas reales con DeepSeek | Revisión manual; vista previa remota de enlaces y mapas reales; limpiar `.env.example` |
| 03/10/2026 (noche) | P8.5, P2.5 y P1.6 implementadas; P2.6 y P4.7 registradas | Revisión manual del usuario: login visible, intención deducida, respuestas breves con «Explicar más», enfoque de observaciones, explicación animada, schema 1.6.0 con iconos y estilos, elementos propios. ADR 057–061 | check 109/109; smoke 36/36; smoke:ai DeepSeek 9/9 | Revisión manual de lo nuevo; limpiar `.env.example`; Luna con clave |
| 03/10/2026 (tarde) | P3.1 con proveedor provisorio | DeepSeek conectado por el adaptador compatible (sólo `.env`); doctor distingue proveedor de prueba | smoke:ai DeepSeek 7/7; doctor local y con ejemplo de producción | Pasos 2 y 3 de la guía; Luna cuando haya clave |
| 03/10/2026 | P8.1/P8.3 avanzan (siguen parciales) | Doctor, alertas por webhook, retención mínima, eliminación de cuenta, borrador de privacidad, chequeo de accesibilidad, guía paso a paso, resumen .docx regenerado. ADR 056 | check 104/104; smoke 34/34; smoke:repository con eliminación y purga; doctor en local, producción y contenedor | Pasos 1–3 de la guía (OpenAI, base local, Auth0) |

Instalación limpia comprobada previamente con `npm ci` y `npm run check` 73/73. El primer `npm ci` encontró un binario Rolldown abierto por la instancia Vite del smoke; se cerró ese proceso identificado y la segunda instalación aprobó. En esta sesión se verificó el árbol actualizado con 82/82 pruebas; no se repitió `npm ci`.

Procesos locales observados: editor en 5173 y gateway en 8787 ya estaban escuchando; no se reiniciaron ni se detuvieron. **Reiniciar el gateway** para cargar las nuevas rutas y variables de cuenta/documentos. Los smokes usaron procesos y bases efímeros aislados. No se levantaron servicios pagos ni se desplegó nada.
