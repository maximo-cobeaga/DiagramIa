# Plan de desarrollo: fases y microfases

El orden original redujo riesgo: contrato → editor → movimiento → IA → SaaS → MCP conectado → interoperabilidad → medición → cierre. Desde el 02/10/2026 manda la sección «Orden de ejecución», alineada con `DIAGRAMIA_SESION_PRODUCTO_NEGOCIO.md` (Lean Startup). La base del ZIP adelanta partes de P0/P1/P2/P5; no declara completas esas fases. Empezar por auditarla y continuar desde sus límites, sin reescribir todo.

Cada microfase: leer contexto → implementar → checks relevantes → comprobar criterio → actualizar estado/backlog/ADR → continuar. Un acceso externo faltante bloquea su smoke real, no el resto del trabajo. No fusionar fases en una gran promesa sin evidencia.

| Fase | Objetivo | Microfases |
|---|---|---|
| P0 | Base y contratos | 3 |
| P1 | Editor semántico completo | 5 |
| P2 | Animaciones y presentación | 4 |
| P3 | IA real y observable | 5 |
| P4 | SaaS y persistencia | 6 |
| P5 | MCP del producto | 3 |
| P6 | Interoperabilidad | 4 |
| P7 | Medición y aprendizaje | 4 |
| P8 | Cierre de V1 | 4 |

## Orden de ejecución (decidido el 02/10/2026)

Objetivo: llegar a usuarios reales con la IA Free acotada y medir desde el primer día. Higgsfield se retiró del producto (ADR 044).

**Antes del lanzamiento**

1. **P3.1 — IA Free con GPT-6 Luna** (ADR 045): adapter con structured outputs estrictos, esfuerzo de razonamiento configurable, costo USD por pedido y `npm run smoke:ai` real. Bloqueo externo: `OPENAI_API_KEY`.
2. **P7.1 y P7.2 — Medición**: eventos del embudo, editor, errores, performance e IA en PostgreSQL propio (ADR 046) y feedback 👍/👎.
3. **P4.1 y P4.4 — Cuenta real y antiabuso**: tenant Auth0 con Google + email (ADR 047), email verificado, rate limit por IP, tope global de gasto con alerta y corte.
4. **P8.2 y P8.3 — Performance y seguridad**: release candidate.
5. **P8.4 — Despliegue autorizado** en el VPS, aislado de ReservApp; landing en el dominio principal y editor en `app.`.
6. **P7.3 — Dashboard del fundador** con los 10 indicadores iniciales.

**Después del lanzamiento, según datos reales:** P4.6 (billing con Paddle y Pro), P7.4 (agente Data/Product), P4.3 (assets en almacenamiento), P5.3 (MCP en hosts externos) y el resto de P6.4 (export temporal).

**En paralelo:** revisión manual del usuario, pruebas de usabilidad, comunidad y Build in Public.

## P0 — Base y contratos

### P0.1 — Auditar y ejecutar el starter

**Implementar:** Instalar con npm ci, correr check y schemas; abrir los tres fixtures. Registrar límites reales, no regenerar el repo.

**Áreas:** `packages/core, apps/editor, apps/mcp`.

**Salida verificable:** Build limpio, 14 tests existentes aprobados y revisión visual registrada.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P0.2 — Versionado y migraciones

**Implementar:** Agregar migración formal desde schema 1.0.0, capabilities y pruebas de fixtures anteriores.

**Áreas:** `packages/core, schemas, docs/05_CONTRATOS.md`.

**Salida verificable:** Documento viejo migrado sin cambiar IDs; versión desconocida rechazada con recuperación/exportación.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P0.3 — Estado y persistencia recuperable

**Implementar:** Separar DocumentStore, ViewStore, SelectionStore y PlaybackStore. Guardado con estados/fallo/recuperación; historia acotada sin pérdida silenciosa.

**Áreas:** `apps/editor/src/store, packages/core`.

**Salida verificable:** Recarga conserva el documento; almacenamiento lleno produce aviso y export disponible; undo/redo no cambia playhead.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P1 — Editor semántico completo

### P1.1 — Interacción de canvas

**Implementar:** Pan, zoom al cursor, fit, selección rectangular, handles, resize, clipboard y atajos documentados.

**Áreas:** `apps/editor/src/canvas`.

**Salida verificable:** Arrastrar/zoom no desplaza nodos erróneamente; teclado y móvil operables; fit incluye todo sin labels ilegibles.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P1.2 — Zonas y marcadores

**Implementar:** Herramientas dibujables, edición de límites/labels, anchors/ports, selección por zona y reglas de membership.

**Áreas:** `packages/core, apps/editor/src/tools`.

**Salida verificable:** Agregar dentro de zona mantiene pertenencia; zona duplicada por label necesita desambiguación; límites incompatibles visibles.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P1.3 — Grupos, frames y assets

**Implementar:** Modelar/renderizar grupos anidados, frames, texto, iconos e imágenes; schema/migración y sanitización de assets.

**Áreas:** `packages/core, apps/editor/src/assets`.

**Salida verificable:** Grupo se mueve sin perder referencias; frame tiene bounds; SVG externo no ejecuta scripts; no prometer image antes de renderizarlo.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P1.4 — Routing y layout determinista

**Implementar:** Conectores con ports y evasión de obstáculos; relative placement, align/distribute y auto-layout local.

**Áreas:** `packages/core/src/layout, apps/editor/src/canvas`.

**Salida verificable:** Mismo input da mismo resultado; ordenar selección no mueve elementos externos; constraints imposibles se explican.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P1.5 — Componentes reutilizables

**Implementar:** Biblioteca inicial arquitectura SaaS/cloud y procesos; componentes parametrizados con IDs nuevos sólo al instanciar.

**Áreas:** `packages/core, apps/editor/src/library`.

**Salida verificable:** Instanciar dos veces no colisiona IDs; editar una instancia no modifica otra; biblioteca se importa/exporta.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P2 — Animaciones y presentación

### P2.1 — Timeline editable

**Implementar:** Editar duración/orden/caption, agregar/borrar pasos, repetir y recorrer; cambios pasan por acciones.

**Áreas:** `packages/core, apps/editor/src/timeline`.

**Salida verificable:** Seek al límite de cada paso exacto; editar/reabrir conserva pasos; undo de edición funciona separado de playback.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P2.2 — Ramas, estados y paralelismo

**Implementar:** Variables/triggers, escenarios explícitos, highlight y recorrido simultáneo. Runtime determinista sin ejecutar sistemas reales.

**Áreas:** `packages/core/src/animation`.

**Salida verificable:** Compra normal y rechazo cambian topología/recorrido; reintento no duplica pedido; cancelación explica liberación de stock.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P2.3 — Cámara y presentación

**Implementar:** Frames, focus, pan/zoom de cámara, secuencias y modo presentación con controles accesibles.

**Áreas:** `apps/editor/src/presentation`.

**Salida verificable:** Presentación funciona con teclado, pausa y reduced-motion; salir vuelve al canvas sin modificar contenido.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P2.4 — Plantillas de explicación

**Implementar:** Templates de login, SaaS y flujo comercial; editor de tracks básico y export de timeline estructurada.

**Áreas:** `examples, apps/editor/src/timeline`.

**Salida verificable:** Animación editable ligada a IDs; borrar nodo detecta/poda referencias con aviso de captions; varios tracks sincronizados.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P3 — IA real y observable

### P3.1 — Gateway local y adapters

**Implementar:** Crear apps/api local para inference; provider interface, secrets en servidor, timeouts y capabilities. No exponer gateway sin auth.

**Áreas:** `apps/api, packages/providers`.

**Salida verificable:** Un provider real y uno local compatible funcionan con credenciales disponibles; error sin clave visible; mock marcado separado.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P3.2 — Contexto selectivo

**Implementar:** Selección, zona, vecindario, límites de tokens y reglas semánticas; contexto no incluye claves.

**Áreas:** `packages/core/src/context, apps/api`.

**Salida verificable:** Editar API seleccionada conserva el resto; zonas homónimas no se adivinan; documento grande respeta presupuesto.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P3.3 — Propuestas y staging observable

**Implementar:** Chat lateral, structured actions, reparación acotada, preview/diff, staged steps, aceptar/rechazar y cancelar.

**Áreas:** `apps/editor/src/assistant, apps/api`.

**Salida verificable:** Prompt agrega Redis correctamente; rechazo y cancelación no cambian el documento; stale revision no sobreescribe trabajo manual.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P3.4 — Modos de IA y anotaciones

**Implementar:** Create/Edit/Explain/Review/Transform/Animate/Document con salidas apropiadas y evidencia referenciada.

**Áreas:** `apps/editor, apps/api, packages/core`.

**Salida verificable:** Review crea observaciones localizadas; Explain no muta canvas; Animate produce steps válidos; Document exporta texto consistente.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P3.5 — Uso, presupuesto y resiliencia

**Implementar:** Rate limits, budget máximo por solicitud, reservation/settlement, retries con idempotencia y cancelación.

**Áreas:** `apps/api/src/usage`.

**Salida verificable:** Timeout no dispara loops de gasto; retries no duplican acciones; costo real/estimado diferenciado; corte de gasto comprobado.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P4 — SaaS y persistencia

### P4.1 — Identidad y proyectos

**Implementar:** OIDC mantenido, proyectos y membresías; elegir proveedor documentado sin desarrollar auth casera.

**Áreas:** `apps/api, apps/editor`.

**Salida verificable:** Usuario A no puede leer ni editar documentos de B; sesiones vencidas retornan error recuperable; secrets fuera de build.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P4.2 — Documentos y versiones durables

**Implementar:** PostgreSQL, CAS, transacciones, versiones/receipts, auditoría, migraciones y recuperación.

**Áreas:** `apps/api/src/repositories, migrations`.

**Salida verificable:** Dos writers misma revision: uno gana y otro obtiene conflicto; versión restaurable; reintentos iguales reconocidos tras reinicio.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P4.3 — Assets en almacenamiento

**Implementar:** Storage compatible S3 para imágenes del documento, uploads seguros, cuotas, referencias y garbage collection sin borrar assets usados. Posterior al lanzamiento; sin jobs de renders generativos.

**Áreas:** `apps/api/src/assets`.

**Salida verificable:** Assets privados protegidos; formatos/tamaños inválidos rechazados; un asset referenciado nunca se borra; la cuota de 10 MB/30 MB cuenta los assets.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P4.4 — Free, cuotas y antiabuso

**Implementar:** IA Free con GPT-6 Luna: cuotas por cuenta, email verificado, rate limit por usuario/IP/endpoint, tope global de gasto con alerta y corte, CAPTCHA adaptativo ante riesgo; señales de dispositivo sólo como riesgo. No publicar Free sin límite de gasto.

**Áreas:** `apps/api, apps/editor`.

**Salida verificable:** Cuota agotada bloquea antes del proveedor; cuenta sin email verificado no usa IA; superar el tope global corta la IA Free y alerta; IP compartida no bloquea por sí sola; costo por pedido registrado en USD.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P4.5 — Operación local y CI

**Implementar:** Docker dev, env, health/readiness, logs, CI, backups y prueba de restore.

**Áreas:** `infra, .github/workflows`.

**Salida verificable:** Clonar + npm ci + servicios locales reproducible; backup se restaura a instancia aislada; no exige secretos para checks unitarios.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P4.6 — Billing y planes pagos

**Implementar:** Capa de billing propia con eventos internos; Paddle como Merchant of Record inicial y Lemon Squeezy como alternativa; webhooks traducidos a eventos internos; plan Pro; BYOK opcional. Posterior al lanzamiento.

**Áreas:** `apps/api/src/billing, apps/editor`.

**Salida verificable:** Webhooks firmados y deduplicados; el proveedor se reemplaza sin tocar la lógica de planes; no inventar precios; condiciones del MoR verificadas en documentación oficial antes de integrar.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P5 — MCP del producto

### P5.1 — Unificar canal de cambios

**Implementar:** Conectar MCP, backend y editor al documento compartido; receipt/revision y events/reconnect.

**Áreas:** `apps/mcp, apps/api, apps/editor`.

**Salida verificable:** Cambio MCP aparece en editor sin importar archivo; edición UI aparece al leer por MCP; no bucles ni sobrescritura silenciosa.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P5.2 — Transporte remoto y permisos

**Implementar:** Streamable HTTP + OAuth vigente, scopes, project authorization, resource audience y protección de sesiones.

**Áreas:** `apps/mcp, apps/api`.

**Salida verificable:** Host sin scope de escritura sólo lee; otro tenant no accede; OAuth resource/audience inválido rechazado; stdio local sigue funcionando.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P5.3 — Capacidades y hosts

**Implementar:** Selection/region, inspect/export/animate, recursos/prompts/schema versionado; probar al menos dos hosts externos.

**Áreas:** `apps/mcp, integrations`.

**Salida verificable:** Read/preview/apply con selección real funciona en ambos hosts; error estructurado y reconnect comprobados; capabilities no anuncian operaciones inexistentes.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P6 — Interoperabilidad

### P6.1 — Mermaid y Markdown

**Implementar:** Import/export de subset de flowchart; reporte de unsupported; documentación desde selección.

**Áreas:** `packages/interop`.

**Salida verificable:** Round-trip conserva IDs/labels/edges del subset; sintaxis inválida no borra documento; animaciones no soportadas se reportan.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P6.2 — draw.io y Graphviz

**Implementar:** XML/DOT con parser seguro y mapping documentado; sin ejecutables ni entidades externas.

**Áreas:** `packages/interop`.

**Salida verificable:** Import de fixtures reales; parser limita tamaño/profundidad; pérdidas reportadas; XML externo no hace requests.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P6.3 — PlantUML, UML y BPMN

**Implementar:** Subsets definidos por caso de uso, tipos semánticos y reglas de export. No afirmar cobertura total.

**Áreas:** `packages/interop, examples`.

**Salida verificable:** Clases/secuencia/estados y proceso básico importan con informe; unsupported explícito; referencias coherentes.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P6.4 — Export visual y artefactos

**Implementar:** SVG standalone, PNG, PDF y export de presentación/animación con límites y fondos.

**Áreas:** `packages/interop, apps/editor`.

**Salida verificable:** Export coincide con canvas sin UI, fonts/embed seguros, resolución elegible; JSON sigue siendo formato lossless; video no reemplaza documento.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P7 — Medición y aprendizaje

Fuente: `DIAGRAMIA_SESION_PRODUCTO_NEGOCIO.md`. Telemetría propia en PostgreSQL (ADR 046); sin contenido de diagramas, prompts completos ni secretos en los eventos.

### P7.1 — Eventos y captura

**Implementar:** Contrato de eventos versionado (adquisición, registro, activación, editor, errores y performance); ID anónimo, sesiones, UTMs y referrer; vinculación sesión anónima → usuario; ingesta por lotes hacia PostgreSQL; aviso de privacidad.

**Áreas:** `packages/core, apps/editor, apps/api`.

**Salida verificable:** Embudo landing_view → useful_diagram_created reconstruible desde la base; eventos inválidos rechazados; el editor funciona igual si la ingesta falla; ningún evento contiene texto del diagrama, prompts completos ni claves; rate limit de ingesta.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P7.2 — Métricas de IA y feedback

**Implementar:** Por interacción: modelo, tokens, costo USD, latencia, error/cancelación, regeneración, insertado/descartado, ediciones y undo posteriores; 👍/👎 con motivo después de cada generación.

**Áreas:** `apps/api, apps/editor`.

**Salida verificable:** AI Acceptance/Regeneration/Edit/Immediate Undo Rate y costo por usuario y por diagrama útil calculables; el feedback es opcional y no interrumpe.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P7.3 — Agregados y dashboard del fundador

**Implementar:** Agregación diaria, North Star (diagramas útiles por usuario activo por semana), cohortes D1/D7/D30 y los 10 indicadores iniciales en una vista privada.

**Áreas:** `apps/api, apps/editor`.

**Salida verificable:** Los indicadores salen de agregados reproducibles; acceso sólo para administradores; con datos de prueba conocidos los números coinciden.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P7.4 — Agente Data/Product

**Implementar:** Reporte diario o semanal sobre datos preagregados: qué cambió, cuánto, hipótesis y experimento sugerido. Sólo analiza; no decide. Requiere usuarios reales.

**Áreas:** `apps/api, scripts`.

**Salida verificable:** Trabaja sólo con agregados; costo medido menor a USD 5/mes; cada afirmación cita la métrica que la respalda.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## P8 — Cierre de V1

### P8.1 — UX y accesibilidad

**Implementar:** Revisión visual desktop/tablet/móvil, teclado, foco, reduced-motion, errores vacíos y feedback de usuarios.

**Áreas:** `apps/editor, apps/landing`.

**Salida verificable:** Recorridos de aceptación completos; no clipping; texto y controles legibles; colores no son único indicador.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P8.2 — Performance y estabilidad

**Implementar:** Medir fixtures 100/500/2000 nodos, payloads, uso memoria y long tasks; adoptar mejoras según evidencia.

**Áreas:** `packages/core, apps/editor, apps/api`.

**Salida verificable:** Presupuesto de performance registrado con equipo/browser; no bloqueos críticos; validación no depende de renderer.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P8.3 — Seguridad y release candidate

**Implementar:** Permisos, secrets, SSRF/assets, cuotas, licencias, backup/restore y documentación operativa.

**Áreas:** `infra, apps/api, docs`.

**Salida verificable:** Checks y pruebas de contrato reales; sin claves/build leaks; bloqueos reales abiertos no se ocultan bajo status completed.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.
### P8.4 — Entrega y despliegue autorizado

**Implementar:** Runbook de instalación, config, deploy/rollback y demo final en el VPS Hostinger KVM 2 compartido con ReservApp: contenedores separados con límites de CPU/memoria, reverse proxy con TLS, landing en el dominio principal y editor en `app.`, backups programados. Decidir dominio, audiencia y presupuesto.

**Áreas:** `docs, infra, DEVELOPMENT_STATE.md`.

**Salida verificable:** Release reproducible y reversión probada; Diagramia no degrada a ReservApp bajo carga; desplegar sólo con autorización correspondiente; V1 completa según criterios o bloqueos identificados.

**Cierre:** registrar comandos/evidencia y comportamiento pendiente; comprobar que los tres ejemplos siguen válidos.

## Después de V1

Colaboración CRDT, marketplace, repositorio → arquitectura, diagrama → spec/código y simulaciones avanzadas forman un roadmap posterior. Antes de implementar cada una, definir caso de uso, permisos y criterios propios. No tratarlas como promesa de V1 ni como pretexto para retrasar el núcleo.

## Trabajo en varias sesiones

La herramienta/modelo puede agotar contexto o detenerse. Mantener checkpoints en DEVELOPMENT_STATE.md con próxima microfase, archivos afectados y pruebas. Reanudar desde prompts/02_CONTINUAR.md. No asumir que existe memoria fuera del repositorio.
