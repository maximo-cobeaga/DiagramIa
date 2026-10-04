# Verificación del paquete entregado

## Entorno

Node 24.19.0, npm 11.9.0, Linux. Dependencias exactas del package-lock.json.

## Checks aprobados

- npm ci ejecutado en una copia limpia extraída del ZIP, sin node_modules ni dist previos.
- Compilación TypeScript del core y MCP; typecheck y build de producción del editor.
- 14 pruebas: contratos/fixtures, posición relativa, atomicidad/rollback, revisiones stale, retries/idempotencia, ID conflicts, contención, eliminación de referencias, seeking, paralelismo y polilíneas.
- Un host MCP real usando SDK Client y transporte stdio: discovery, read, preview sin escritura, apply, retry idéntico y conflicto de revisión.
- JSON Schema regenerado en la copia limpia; salida idéntica a los schemas incluidos.
- Generador de configuración MCP ejecutado con rutas absolutas en la copia limpia. Los archivos generados son propios de cada equipo y no se incluyen en el ZIP.
- Plan: 9 fases, 36 microfases y IDs únicos. Ejemplos/contratos JSON parseables y archivos esenciales presentes.
- ZIP comprobado con testzip; manifest con tamaño/hash de sus fuentes y recursos.
- No se incluyen node_modules, builds del editor/MCP/core, credenciales de hosting, repositorio Git ni secretos de proveedores.

## Límites de la verificación

No se ejecutó prueba visual/end-to-end del editor en navegador: el entorno no tiene Chromium instalado. Compilar y probar el engine no demuestra todos los detalles de interacción/UX. P0.1 requiere esa prueba en el equipo del desarrollador.

No se probó en Windows/macOS, ni en hosts Codex/Claude instalados. El protocolo stdio se verificó con un cliente real de SDK; instalar el bloque en un host y su gestión de permisos es una prueba adicional. Los scripts y rutas generadas son portables, pero deben comprobarse en cada plataforma.

No se llamó a modelos, cuentas, cobros o infraestructura externa. Esas funciones están planificadas, no activas. La sincronización MCP-editor en vivo tampoco existe todavía.

El producto completo no está terminado. El paquete entrega una base reproducible para desarrollarlo con agentes y criterios para verificar cada etapa.

---

# Verificación del 01/10/2026

## Entorno

Windows 11 Pro, Node 22.23.1, npm 11.10.0. Chrome instalado (usado en modo headless).

## Checks aprobados

- `npm ci` limpio sobre el starter y sus 14 pruebas originales aprobadas en Windows antes de modificar nada.
- `npm run check`: build de core, interop, providers, editor, MCP y gateway; **40 pruebas** aprobadas.
  - Core (26): las 14 originales más migración 1.0.0→1.1.0 sin cambiar IDs/geometría, versión desconocida rechazada, cambios parciales que conservan campos, referencia inexistente en animación nueva rechazada, placement con colisiones y sin espacio, zonas homónimas, zonas (mover/achicar/eliminar), grupos anidados, edición de timeline y frames, layout determinista que no mueve externos, routing con obstáculo y puertos, biblioteca con IDs nuevos, contexto por selección con presupuesto.
  - Interop (4): round-trip Mermaid de los tres ejemplos, Mermaid escrito a mano con reporte de no soportado, Mermaid inválido, Markdown.
  - Gateway y adapters (9): propuesta validada con diff, reparación acotada, idempotencia por requestId, corte por presupuesto y rate limit antes de llamar al proveedor, timeout sin reintentos y cancelación, modos de texto/review/aclaración, orígenes y header, y contratos de los adapters de Claude y compatible OpenAI contra servidores HTTP locales que imitan la forma de cada API.
  - MCP (1): host real por stdio.
- `npm run schemas`: contratos regenerados para 1.1.0.
- `npm run smoke`: **23/23** en Chrome headless real, con eventos de mouse y teclado reales por DevTools: carga, arrastre + undo, zoom al cursor, marquee + nudge, nodo creado dentro de zona, resize con manijas, propuesta manual con diff, reproducción y undo sin mover el playhead, presentación con teclado, recarga con persistencia, los otros dos ejemplos, recorrido automático, biblioteca, conector y zona que adopta nodos, export SVG/PNG/Mermaid reales, import Mermaid válido e inválido, fallo de almacenamiento, documento de versión desconocida, chat con el gateway (proveedor de demostración), layout tablet 1024×768 y móvil 390×844 sin desborde horizontal, y cero errores de consola.

## Límites de la verificación

- **La IA no se probó contra ningún modelo real.** No había credencial de Anthropic ni un modelo local corriendo. Los adapters tienen pruebas de contrato contra servidores falsos; eso comprueba la forma del pedido y el manejo de respuestas, no que un modelo produzca buenas propuestas. El recorrido del chat se hizo con el proveedor de demostración, que no es una IA.
- El smoke es headless y con una sola resolución de escritorio (1440×900) más tablet y móvil emulados. No cubre 1920×1080, pan, portapapeles, pinch/táctil real, edición de pasos desde la UI, pantalla completa, lector de pantalla, escalado al 200% ni Firefox/Safari.
- Las capturas se revisaron a ojo en esta sesión; no hay comparación visual automática.
- No se probó en macOS/Linux en esta sesión, ni el MCP dentro de un host instalado.
- Sin backend, auth, DB ni despliegue: no hay nada que verificar ahí todavía.

## Para probar a mano

Levantar con `npm run dev` (y `npm run api` para la pestaña IA). Los atajos están en la pestaña **Sesión**.

1. Los tres ejemplos: mover, seleccionar varios, redimensionar, deshacer/rehacer.
2. Pan con espacio/botón central/mano, zoom con Ctrl + rueda, Encuadrar.
3. Copiar, pegar, duplicar, agrupar y desagrupar; Alt + clic dentro de un grupo.
4. Dibujar zona y frame; mover una zona con sus nodos; achicarla por debajo de sus nodos (debe rechazarse con aviso).
5. Conector entre nodos; cambiar puertos, etiqueta y «camino alternativo» en Propiedades.
5a. Herramientas Línea, Flecha y Dibujar: crear sobre el fondo y sobre contenido, seleccionar, mover, eliminar, encuadrar y exportar en SVG; guardar/reabrir JSON sin perder puntos ni IDs.
6. Alinear, distribuir y auto-layout sobre una selección.
7. Timeline: editar texto/duración/tono/encuadre de un paso, mover, agregar, eliminar; reproducir con Repetir.
7a. Crear una animación con selección y un recorrido automático; agregar pasos desde la acción visible. Abrir Ajustes del paso para editar duración y probar una rama opcional.
8. Presentar: flechas, K o espacio, Esc; con `prefers-reduced-motion` activado.
9. Exportar cada formato y reimportar el JSON y el Mermaid.
10. Biblioteca: insertar, guardar selección, exportar e importar.
11. IA con un proveedor real: «Agregá Redis dentro de Backend debajo de API»; rechazar, cancelar a mitad, editar mientras responde (debe pedir regenerar), y un pedido ambiguo con dos zonas del mismo nombre.
12. En un teléfono real: herramientas, pan con un dedo, pinch.

---

# Verificación del 02/10/2026

Mismo entorno. `npm run check`: **45 pruebas** aprobadas (5 nuevas en core: migración 1.1.0→1.2.0, ramas con topología y estados finales distintos, coherencia al editar escenarios, assets reales/estáticos/usados, anotaciones). `npm run schemas` regenerado para 1.2.0. `npm run smoke`: **26/26**, con tres recorridos nuevos: escenarios y estados en el ejemplo de rechazo, alta de una imagen PNG + rechazo de un SVG con script + baja del asset con su nodo, y anotaciones (manual y desde una revisión con el proveedor de demostración) que aparecen en el canvas y en Markdown pero no en el SVG exportado.

El check «conector y zona» del smoke falló en 2 de 7 corridas. La causa era un defecto real del canvas: al soltar el botón justo después del último movimiento, el gesto se resolvía con un estado anterior (la conexión no se creaba o la zona quedaba más chica). Se corrigió guardando el gesto en una referencia síncrona y recalculándolo al soltar; después de la corrección pasó 4 corridas seguidas de 4. Es evidencia a favor, no una demostración: si reaparece, mirar `Canvas.tsx` (`advance`).

Límites: la reducción automática de fotos grandes, los iconos, la edición de escenarios/estados desde la interfaz y el selector de escenario en presentación no tienen prueba automática. La IA sigue sin probarse contra un modelo real.

## Para probar a mano (agregado)

13. Ejemplo «Rechazo y recuperación»: elegir cada escenario en la timeline, reproducir y ver los estados sobre los nodos; presentar y cambiar de escenario.
14. En «Editar paso…»: marcar escenarios de un paso, asignar un estado al nodo seleccionado, agregar y eliminar un escenario.
15. «Agregar imagen…» con una foto grande (debe reducirse), un PNG chico y un SVG; exportar a SVG/PNG y comprobar que la imagen sale.
16. Asignar un icono a un nodo desde Propiedades.
17. Anotaciones: agregar, editar, resolver y eliminar sobre un nodo, una conexión y una zona; borrar el elemento anotado y ver que la anotación queda en el documento.

---

# Verificación del cierre de P3 (02/10/2026)

`npm run check`: **51 pruebas** (gateway/adapters 14: se agregan historial de conversación, recorte de un documento de 600 nodos, zonas homónimas resueltas sin llamar al proveedor, elección de zona respetada con reparación, y modo JSON del adapter local). `npm run smoke`: **27/27**, con un recorrido nuevo de IA en el editor: cancelar a mitad, ver la propuesta en el canvas sin cambiar el documento, rechazar, editar mientras la propuesta espera (queda obsoleta), regenerar y aplicar.

## Primera prueba con un modelo real

`npm run smoke:ai -- local` contra Ollama con **qwen2.5-coder:7b** (modelo local de 7B, sin costo). Comprueba con el engine lo que el modelo devuelve: Redis dentro de Backend, debajo de la API, conectado y sin tocar otros nodos; reintento idéntico sin segunda llamada; Explicar sin acciones; Revisar con IDs existentes; aclaración ante dos zonas «Backend»; y la zona elegida respetada.

- Antes de endurecer el gateway: entre 2 y 4 de 5 por corrida (JSON inválido, un nodo usado como zona, `null` donde iba texto, nodo sin pertenencia a la zona, zona homónima equivocada).
- Después (modo JSON nativo, ejemplo e índice de zonas en el prompt, normalización de `null`, herencia de zona, desambiguación por código): **6/6 en tres corridas seguidas**, 10–20 s por pedido.

Límites: es un modelo chico; tres corridas no son una medida estadística y otros pedidos pueden fallar. **Claude no se probó**: falta la key. Crear, Transformar, Animar y Documentar no tienen prueba con modelo real. La vista previa paso a paso sólo se comprobó con la propuesta de dos pasos de la demostración.

## Para probar a mano (agregado)

18. Pestaña IA con un proveedor real: pedir un cambio, tildar «Ver la propuesta en el canvas», mover el control «Paso a paso», aceptar; repetir y rechazar.
19. Hacer una pregunta de seguimiento («ahora conectalo con la base») y ver que recuerda el turno; «Nueva conversación».
20. Con dos zonas del mismo nombre: pedir algo «dentro de <nombre>» sin seleccionar nada (debe pedir que elijas, sin consumo) y después con una de las dos seleccionada.

## Pedido libre con el modelo local (02/10/2026)

Pedido del usuario: «Agregá un usuario que consuma React», sobre el ejemplo de arquitectura, con qwen2.5-coder:7b. Tras agregar al prompt un índice de nodos (ID → nombre) y los IDs reales al mensaje de reparación: 5 de 6 respuestas fueron propuestas válidas para el engine, pero sólo 2 de 6 hacían lo pedido (un nodo de usuario conectado a React); las demás omitían la conexión, conectaban con otro nodo o ubicaban el nodo dentro de Backend. El gateway garantiza que lo propuesto sea válido y no rompa el documento; no puede garantizar que un modelo chico interprete bien la intención. qwen3:8b no respondió en 5 minutos en este equipo. Los modelos locales registran uso pero no descuentan del presupuesto diario. `node scripts/ai-try.mjs "<pedido>" [proveedor] [repeticiones]` repite un pedido y muestra qué propone.

Agregado el 02/10/2026: la propuesta de IA ahora se dibuja sola en el canvas al llegar (resaltada, sin aplicarse) y el diff avisa si un nodo nuevo queda sin conexiones. check: 53/53; smoke: 27/27 contra una instancia separada (puerto 5174) para no tocar el documento en uso. Se agregó un segundo proveedor compatible con /chat/completions (variables DIAGRAMIA_COMPAT_*), sin probar contra ningún servicio real.

---

# Continuación del 01/10/2026: schema 1.3.0 y editor

Se revisó la última sesión local de Claude, que terminó por límite semanal después de 62/62 tests. El pedido de formas tipo draw.io/UML/flujo, estilos y texto editables, enganches libres, chat visual, pestañas, modo oscuro, tutorial y panel plegable estaba implementado; faltaban el smoke real de Crear, los contratos generados y el cierre documental.

- `npm run schemas`: JSON Schemas 1.3.0 regenerados. Los tres ejemplos ya estaban migrados a 1.3.0.
- `npm run check`: **66/66**. Cuatro pruebas nuevas cubren rechazo atómico si el ordenador necesitaría más de 200 acciones, geometría inválida de un nodo de IA sin relajar IDs/tipos, conversión del inventario de Crear a acciones canónicas y espacio para etiquetas largas.
- `npm run smoke` en Chrome headless real: **30/30**. Incluye formas, texto en el lugar, estilo, reconexión de flechas por enganche, pestañas independientes, modo oscuro, panel plegable, tutorial y canvas visible en la primera pantalla móvil. Se revisaron `state/smoke/14-desktop-shapes-style-anchors.png`, `15-desktop-dark.png` y `07-mobile.png`.
- `npm run smoke:ai -- local` con Ollama/qwen2.5-coder:7b: dos corridas 7/7 con la prueba básica de Crear. Al endurecer la prueba para exigir todas las relaciones y comprobar todas las incidencias de `findOverlaps`, se detectaron etiquetas sobre nodos. Tras ampliar el espacio del layout según el ancho de etiquetas: **6/7**, con las seis comprobaciones obligatorias aprobadas, incluida Crear (4 nodos, 3 conexiones, Backend, cadena usuario→frontend→API→base y cero incidencias detectadas). La séptima es un caso opcional de zona homónima: el modelo devolvió una aclaración innecesaria. No se aplicó ningún resultado inválido.

Límites: las rutas manuales/curvas y todos los cruces entre conexiones aún no tienen una garantía general de no solapamiento. El modelo local de 7B puede interpretar mal pedidos libres o pedir aclaraciones erróneas; esta evidencia no mide su tasa de éxito. En móvil el catálogo ya no tapa la primera pantalla, pero el zoom inicial de un diagrama ancho puede hacer que el texto se vea pequeño: usar acercar/pan y verificar en un teléfono real. No hubo prueba de lector de pantalla, táctil/pinch real, Firefox/Safari ni proveedor Claude. `state/smoke/` no está versionado.

## P4.5 parcial: operación local

`docker compose -f infra/compose.dev.yml config -q` aprobó. Docker Desktop 29.6.2/Compose 5.3.1 levantó la imagen oficial PostgreSQL 17.11-alpine con healthcheck hasta `Healthy`. `npm run smoke:db` creó dos proyectos efímeros: escribió una fila en origen, generó un `pg_dump -Fc` de 1684 bytes, lo restauró con `pg_restore` en destino y leyó `42:restaurado`; ambos proyectos y sus volúmenes de prueba se limpiaron. `scripts/pg-backup.mjs` produjo un archivo custom válido de 846 bytes en `state/backups/` desde otro proyecto aislado. No se tocaron bases ajenas.

El gateway ahora expone `/health` y `/ready`, y registra método, ruta, estado y duración sin prompt ni query; test de contrato con texto sensible: aprobado. El CI añade un job sin secretos que valida Compose y ejecuta el smoke de restauración. `npm run check`: **67/67**. Límite: la DB aún no almacena documentos, así que no se ha probado restaurar versiones ni recibos reales de P4.2; el job de GitHub no se ejecutó porque este árbol no contiene `.git`.

## P4.2 y cierre local de P4.5: documentos PostgreSQL

`npm run check`: **67/67**, build completo sin errores. `npm run smoke:repository`: aprobado contra dos instancias PostgreSQL Docker aisladas. Comprobó migración concurrente con checksum; dos writers sobre la revisión 0 (uno gana, otro recibe `REVISION_CONFLICT`); lote inválido sin cambio ni versión; versiones anteriores y restore que crea revisión nueva; recibos tras reabrir el Pool y después de 101 lotes; token de documentos en HTTP, alta, lote, versiones y auditoría; backup custom y recuperación de documento, 105 versiones, 105 eventos y recibos en otra instancia. El smoke limpió sólo sus volúmenes efímeros.

La integración del editor/MCP con estas rutas sigue pendiente (P5.1), así como cuentas/permisos (P4.1). El CI remoto no se ejecutó porque este árbol no contiene `.git`. El smoke de repositorio no sustituye una prueba de usuario con el editor; los recorridos manuales anteriores siguen vigentes.

## P6.2: draw.io y Graphviz

`npm run check`: **73/73**. Las seis pruebas nuevas cubren round-trip draw.io de IDs, nodos, zonas, endpoints y geometría; `mxGraphModel` estilo jgraph y página comprimida; rechazo de DTD/entidades externas y XML demasiado profundo; grupo aplanado con posición absoluta y pérdida reportada; import/export DOT con clusters, cadenas y reporte de pérdidas; errores de sintaxis sin documento parcial. El editor acepta `.drawio`, `.xml`, `.dot` y `.gv` y ofrece ambos exports. Límites y mapping en `docs/INTEROP.md`. `npm run smoke` con instancia aislada del editor en 5174: **30/30**; tres comprobaciones de IA quedaron omitidas porque no se levantó el gateway de demostración. El primer intento del smoke sin servidor devolvió `SecurityError` en `about:blank`; se repitió correctamente con Vite activo. Falta revisar manualmente archivos draw.io/DOT variados en el editor.

`npm ci` y otro `npm run check` desde dependencias reinstaladas: **73/73** al cierre, cero vulnerabilidades reportadas por npm. En Windows fue necesario cerrar el proceso Vite del smoke antes de reinstalar porque mantenía abierto el binario nativo Rolldown.

## Corrección durante prueba manual: `kind` en modo Crear

El usuario pidió «Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos» y recibió 422 por `nodes.0.kind` y `nodes.2.kind` inválidos tras dos intentos; el documento permaneció intacto. El contrato de salida de Crear decía `kind:string` sin enumerar los valores. Se añadió la lista exacta al prompt y a la reparación, más un mapa cerrado `user→actor`, `frontend/api→service`, `db→database` y otros alias explícitos. La prueba de contrato confirma que esos alias producen cuatro nodos canónicos y tres conexiones en un intento, y que `invented` sigue rechazado (422). `npm run check`: **74/74**.

Prueba real adicional con qwen2.5-coder:7b en un gateway aislado (8788), mismo pedido: HTTP 200, propuesta en un intento (`repairs:0`), cuatro nodos (`actor`, `service`, `service`, `database`) y cinco conexiones válidas según el core. No se aplicó al documento del usuario. El gateway existente en 8787 no se reinició: requiere reinicio para usar el cambio.

## P2.4: pistas de animación (01/10/2026, continuación)

`npm run schemas` regeneró los contratos 1.5.0. `npm run check`: **81/81**. `npm run smoke`: **32/32** en Chromium, con el recorrido de la plantilla de login, sus tres pistas, cambio de rama y alta de pista/clip. El smoke omitió los casos de IA de demostración porque no estaba levantado el gateway con `DIAGRAMIA_ENABLE_MOCK=1`. Se inspeccionó la captura `state/smoke/16-desktop-login-tracks.png`; la grilla se ve al abrir «Pistas».

Para probar a mano esta fase:

1. Ejecutar `npm run dev` y abrir el editor. Cargar el ejemplo **Inicio de sesión** desde los ejemplos. No hace falta iniciar la API para este recorrido.
2. En la barra de animación, elegir **Inicio de sesión** y luego **Credenciales correctas**. Pulsar **Pistas (3)**: deben verse Resaltado, Explicación y Cámara. Reproducir y comprobar que los elementos resaltados, el texto y el encuadre siguen los pasos.
3. Elegir **Credenciales incorrectas**. La grilla debe mostrar sólo los pasos de esa rama; reproducirla y comprobar que el texto explica el rechazo. Cambiar de rama otra vez y verificar que los clips originales siguen allí.
4. Elegir **Texto adicional** y **+ Agregar pista**. Pulsar **+ Efecto** en un paso; editar «Texto visible en este paso» y volver a reproducir. Guardar/exportar JSON, reimportarlo y comprobar el texto. Probar deshacer y rehacer.
5. Seleccionar un nodo del diagrama, agregar un efecto en una pista de resaltado y usar **Usar selección actual**. Borrar el nodo y comprobar que aparece un aviso de referencias podadas y que la animación sigue funcionando. Probar también quitar un efecto y eliminar una pista.
6. Entrar en **Presentar** y recorrer ambas ramas con teclado; comprobar texto, resaltados y encuadre. Repetir con movimiento reducido activado en el sistema.

Pendiente: evaluación manual con mouse/táctil, lector de pantalla, 200 % de zoom y diagramas complejos. No se probaron nuevas pistas contra un modelo de IA real; los efectos son datos y acciones validados por el core.

---

# Avance de cuenta, documento compartido y PDF (01/10/2026)

`npm run check`: **82/82** pruebas y builds. `npm run smoke:repository`: aprobado con dos bases PostgreSQL Docker efímeras, incluyendo aislamiento A/B, caducidad de sesión, cuotas de documentos y créditos, CAS, idempotencia, lectura MCP, backup/restore y rechazo de lectura/escritura de documentos de cuenta por la ruta local aun con un ID interno conocido. `npm run smoke:shared`: aprobado en Chromium con PostgreSQL efímero: MCP→editor, editor→MCP, undo compartido durable, cuenta/nube y reconexión tras recargar. `npm run smoke`: **32/32**; comprueba que se descargan PDFs reales del diagrama y de la presentación con firma `%PDF-` y contenido. Los smokes de navegador usan perfil aislado; no reemplazan la revisión manual de diseño.

El flujo OIDC se probó con un issuer local que firma ID Tokens RS256, incluyendo PKCE, state, nonce, cookie vinculada al navegador, firma y rechazo de callback repetido. **No se probó con un tenant Auth0 real**, ni se validaron sesiones entre dos dispositivos físicos. En ese checkpoint aún no se habían probado MCP remoto OAuth, cobro, BYOK, S3, PDF complejo impreso o video animado; el avance MCP posterior aparece al final de este archivo.

## Recorrido manual sugerido

1. Seguir `docs/CUENTA_Y_COMPARTIDO.md` para arrancar PostgreSQL y un gateway nuevo. El proceso del gateway que ya esté en 8787 debe reiniciarse para tomar este código. No usar el smoke contra el perfil habitual.
2. Abrir dos navegadores/perfiles en el editor. En **Cuenta → Espacio compartido local**, compartir una pestaña. Abrir ese ID desde el otro perfil; editar un nodo y esperar unos segundos. Comprobar que aparece sin importar archivos. Editar desde MCP stdio, esperar y comprobar el cambio en ambos perfiles.
3. Provocar edición simultánea desde ambos perfiles sobre la misma revisión. El perdedor debe ver el conflicto y poder descargar su copia local; recuperar la versión remota no debe sobrescribir silenciosamente la copia.
4. Con una cuenta Auth0 real configurada, iniciar sesión, subir un documento y recargar. Abrir con una segunda cuenta: el documento ajeno no debe aparecer ni abrirse por URL/ID. Agotar los 3 documentos Free; el cuarto debe dar un error recuperable. Cerrar sesión y confirmar que desaparece el acceso a nube e IA.
5. Exportar **PDF del diagrama** y **PDF de la presentación** desde el panel Exportar. Abrir ambos PDFs y revisar texto, trazos, márgenes, ramas, resaltados y encuadre. Reimportar JSON y comprobar que la edición sigue disponible; el PDF es sólo visual.
6. Completar los recorridos anteriores de pistas de animación, táctil y accesibilidad. Registrar incidencias concretas con el documento JSON y pasos para repetirlas.

---

# P6.3: PlantUML y BPMN (01/10/2026)

`npm run check`: **88/88**. `npm run smoke`: **33/33** en Chromium con instancia aislada; el recorrido nuevo importó `.puml` y `.bpmn` desde el selector de archivos, comprobó nodos/conexiones y exportó PlantUML y BPMN desde el selector del editor. Las pruebas de interop cubren clases con miembros, mensajes, estados, referencias, geometría BPMN DI, proceso no ejecutable, gateway paralelo, namespaces, rechazo de DTD/entidades, flujo con referencia faltante y archivos de ejemplo. No se invocó PlantUML ni un motor BPMN externo.

Para revisar a mano, ejecutar `npm run dev`, usar **Importar…** con `examples/uml-classes.puml`, `uml-login-sequence.puml`, `uml-order-states.puml` y `basic-approval.bpmn`. Comprobar que todos los nodos y conexiones se pueden editar, exportar cada tipo y leer el aviso de pérdidas. Reimportar el JSON exportado para verificar la copia completa. Después probar archivos externos reales: features fuera de `docs/INTEROP.md` deben informarse, y un flujo BPMN hacia un elemento omitido debe rechazar la importación sin modificar la pestaña actual.

---

# P5.2: MCP remoto OAuth (01/10/2026)

`npm run check`: **88/88** y builds completos. `npm run smoke:mcp-remote`: aprobado con cliente MCP Streamable HTTP oficial, issuer/JWKS RS256 local firmado y PostgreSQL efímero. Comprobó metadata del recurso, 401 con desafío OAuth, 403 para Host/Origin ajenos, rechazo de audience errónea, token vencido, firma ajena y cuenta inexistente; scope de lectura obligatorio, escritura denegada sin `diagramia:write`, rol viewer, autorización por proyecto y dos proyectos con un mismo ID semántico. El smoke usó la ruta HTTP real y eliminó su volumen. `npm run smoke:repository`: aprobado después del montaje de `/mcp`; conserva los contratos HTTP/stdio, CAS, cuentas y backup/restore. No hubo cambios visuales en el editor después de `npm run smoke` **33/33** de P6.3.

Se añadió configuración en `.env.example`, guía en `docs/MCP_REMOTO.md` y ADR 042. **No se probó Auth0 real, proxy público ni dos hosts externos**. Para esa comprobación, registrar audience/scopes en Auth0, iniciar sesión en Diagramia, conectar un host compatible con OAuth a la URL `/mcp`, leer un documento propio, intentar escribir con token de sólo lectura y repetir con otra cuenta. Verificar también `resource`, firma y rechazo de un ID ajeno, y reconexión del host. P5.3 requiere ampliar herramientas y probar dos hosts.

## Informe ejecutivo para lectura (01/10/2026)

Se generó `docs/Estado_Diagramia_MVP.docx` a partir de `scripts/create-status-doc.ps1`. Se validó la estructura ZIP/OpenXML y cada XML; Microsoft Word abrió el archivo sin error y lo paginó en una página. El informe no cambia las decisiones ni el estado de las microfases.

---

# Publicación del repositorio Git (02/10/2026)

Se inicializó Git y se publicó `main` en `https://github.com/maximo-cobeaga/DiagramIa`, repositorio público existente y vacío. `git check-ignore` confirmó que `.env`, `node_modules`, el ledger, respaldos y capturas no entraron al commit; el escaneo de los archivos preparados no encontró claves privadas con los patrones revisados. El informe `.docx` sí está incluido. El primer CI pasó `check` pero falló `database` por compilar API antes de MCP en `smoke:repository`; se corrigió también el orden de `smoke:shared`. `npm run smoke:repository` pasó localmente y el CI del commit `65baaf9` terminó con **`check` y `database` aprobados**. No se probó ningún despliegue.

## Revisión manual pendiente de lo agregado el 02/10/2026 (noche)

Lo siguiente pasó pruebas automáticas y smokes, pero falta tu mirada:

1. **Landing → editor:** `npm run dev:landing` y `npm run dev`. «Crear diagrama» (barra, portada y cierre) abre el editor y la URL queda limpia, sin `aid` ni `sid`.
2. **Feedback de IA:** después de una respuesta aparece «¿Te sirvió? 👍 👎». Con 👎 se ofrecen motivos y después «Gracias por tu opinión». No debe molestar ni tapar la propuesta.
3. **Privacidad:** en «Cuenta → Privacidad», el interruptor apaga el envío. Con Do Not Track activo en el navegador aparece deshabilitado y explicado.
4. **Panel del fundador:** con PostgreSQL, cuentas y tu email en `DIAGRAMIA_ADMIN_EMAILS`, `/#fundador` muestra los 10 indicadores. Con datos reales, revisar que las definiciones (ADR 053) respondan tus preguntas.
5. **Email no verificado:** una cuenta sin verificar recibe «Verificá tu email para usar la IA» y no gasta créditos.
6. **Rendimiento en tu equipo y tu teléfono:** abrir un diagrama grande y arrastrar o hacer zoom (`docs/PERFORMANCE.md`).
7. **Eliminar cuenta:** con una cuenta de prueba, «Cuenta → Cuenta y nube → Eliminar mi cuenta». El botón sólo se habilita al escribir ELIMINAR; después vuelve a «Iniciar sesión» y los borradores del navegador siguen ahí.
8. **Aviso de privacidad:** abrí `/privacidad.html` (enlace en el pie de la landing y en «Cuenta → Privacidad») y completá los `[COMPLETAR]` con tus datos.

## Revisión manual pendiente de lo agregado el 03/10/2026 (tu revisión `revision-3-10.md`)

Pasó `npm run check` 109/109, `npm run smoke` 36/36 y `npm run smoke:ai -- compatible` 9/9 con DeepSeek real. Falta tu mirada:

1. **Login a la vista:** sin sesión, arriba a la derecha dice «Iniciar sesión» (en lima). Ya dentro, ves tu inicial y tu email; tocarlo abre la pestaña **Cuenta**, que muestra la cuenta primero.
2. **Botón del panel:** el ícono arriba a la derecha del canvas oculta y muestra el panel lateral.
3. **Chat sin modos:** escribí como hablarías («¿qué hace esto?», «agregá un pago», «¿qué riesgos ves?»). Debajo de cada respuesta, «Lo tomé como» muestra lo que entendió; si se equivocó, elegí otra opción y lo vuelve a pedir.
4. **Respuestas breves y «Explicar más»:** una explicación son 2 a 4 oraciones; «Explicar más» la amplía (cuesta 1 crédito).
5. **Explicación animada:** después de explicar, «▶ Ver explicación animada» recorre el diagrama paso a paso; Esc sale sin cambiar nada. «Guardar como animación» la deja en la línea de tiempo.
6. **Observaciones:** pedí una revisión y tocá el nombre de un elemento: la vista viaja hasta él y lo marca con el color de la gravedad, sin seleccionarlo.
7. **Elementos nuevos:** en la paleta, «Ideas y notas», «Personas», «Negocio», «Educación», «Comunicación y tecnología» y «Lugares y tiempo», y el buscador (probá «dinero» o «post-it»).
8. **Estilos e iconos:** en Propiedades, «Estilo rápido» cambia los colores de uno o varios elementos; «Elegir un icono» muestra los 49 iconos; «Grande, arriba» lo convierte en tarjeta.
9. **Tu propio elemento:** superponé o combiná formas, seleccionalas y tocá «✦ Guardar como elemento propio». En Biblioteca → Mis elementos aparece con miniatura e «Insertar» lo trae como una sola pieza (Desagrupar lo separa).

### Segunda vuelta del 03/10/2026 (estética y diseño automático)

10. **Vista previa al ubicar:** elegí cualquier elemento de la paleta y pasá el mouse por el canvas: tenés que ver ese mismo elemento, semitransparente. Lo mismo al arrastrarlo.
11. **Elementos distintos:** «Ideas y notas», «Personas», «Viajes y planes», «Procesos»… tienen notas adhesivas, globos, píldoras, avatares, insignias, cintas, carpetas, ventanas, pasos y un mapa.
12. **Tu viaje con diseño:** importá `evidencias/evi-1.json` y tocá **✦ Darle diseño**: zonas de color, formas e iconos por tema, el día a día como calendario y un recorrido para ▶ Presentar. Ctrl+Z lo deshace.
13. **Pedido nuevo a la IA:** pedile de nuevo el viaje a Mar del Plata y compará con `evidencias/evi-2-viaje-con-diseno.png`.
14. **Enlaces:** en Propiedades, «Enlace (https://…)»; el nodo muestra el dominio y el botón ↗ abre la página.


### Tercera vuelta del 03/10/2026 (cruces entre zonas y vista previa de enlaces)

`npm run check` 117/117 (un test de layout con zonas satélite y seis de vista previa: direcciones internas, URL, DNS mixto, lectura del `<head>`, redirecciones y límites, ruta del gateway). `npm run smoke` 37/37 en Chromium contra un editor y un gateway de demostración aislados (5174 y 8788); el paso nuevo pone un enlace a `http://127.0.0.1/admin`, pide la vista previa y comprueba el rechazo por red privada sin tocar el documento. Medición con `ARRANGE_DOCUMENT`: viaje `evi-2` de 7 a 2 cruces y de 6 a 1 conexión sobre nodos; checkout de 6 a 2 y de 4 a 1. Vista previa real comprobada contra example.com, wikipedia.org y github.com (https); `http://github.com` no responde desde esta red ni con curl. `perf:core` sin cambios; peor caso nuevo (16 zonas, 120 conexiones curvas entre zonas): ordenar 0,35 s.

15. **Menos cruces:** abrí `evidencias/evi-2-viaje-con-diseno.json` y, sin nada seleccionado, tocá «Ordenar todo sin superposiciones» en Propiedades: el itinerario queda al centro y las demás zonas alrededor, cerca de los días con los que se conectan; las curvas rodean los nodos en lugar de pasarles por encima.
16. **Vista previa de un enlace:** con sesión iniciada, poné un enlace en un elemento y tocá «Traer título y descripción de la página». Revisá la tarjeta y «Usar como nombre y detalle» (Ctrl+Z lo deshace). Un enlace a `http://localhost` o a una IP privada tiene que rechazarse con un mensaje claro.

### Recuperación de Claude (cámara, admin y viaje)

17. **Cámara narrativa (P2.3):** en «Editar pasos», cambiar Enfoque y Transición. Reproducir o tocar un paso guía la vista; «Seguir con la cámara» apagado deja el canvas quieto. Pausar, mover la vista manualmente y cambiar de pestaña detienen el viaje pendiente. Presentar usa una cámara independiente; Esc vuelve al editor. Con reduced-motion, el destino se aplica directamente. Cambiar el enfoque se deshace; reproducir y mover cámara no cambian la revisión.
18. **Admin (P4.4):** con el email verificado incluido en `DIAGRAMIA_ADMIN_EMAILS`, el chat muestra «Admin: sin cuota de créditos ni límite por minuto». Varios pedidos seguidos no devuelven el límite Free ni consumen créditos. Reintentar el mismo ID recupera el recibo; el presupuesto global sigue cortando antes del proveedor. Otra cuenta conserva sus límites.
19. **Viaje a San Pancho:** elegir «Abrir un ejemplo… → San Pancho · viaje de 10 días». Comparar las tres fechas desde Recorrido, presentar y revisar el presupuesto ARS/MXN. Hay 29 elementos editables y 18 pasos. `docs/VIAJE_SAN_PANCHO.md` distingue precios observados y reservas estimadas. Cotizar vuelos, conexiones y hotel antes de usarlo como itinerario definitivo.

### UI y animación simplificada (ADR 069)

`npm run check` **123/123** y `npm run smoke` **41/41**, sin errores de consola. Pruebas nuevas de altura/foco/plegado sin cambios del contenido y edición real de texto/segundos con undo. Revisadas las capturas `evidencias/ui-editor-compacto.png` y `evidencias/ui-animacion-simple.png`; diagramas de arquitectura, checkout, login con pistas y San Pancho, más claro/oscuro y layouts tablet/móvil. Esto verifica los recorridos automáticos; falta observar personas reales.

20. **Más espacio para dibujar:** recargar el editor. La animación abre como reproductor pequeño. «Editar pasos» abre su panel; «Bajar panel» recupera el espacio. Arrastrar el borde hacia abajo reduce el panel y, al bajarlo completamente, lo pliega. Tab enfoca el borde, las flechas ajustan su altura y End lo pliega. El foco vuelve a «Editar pasos»; reproducir sigue disponible y estos gestos no alteran el documento.
21. **Contar una idea sin aprender una timeline:** crear un recorrido, elegir una tarjeta numerada, escribir un texto y cambiar su duración en segundos. Resaltar lo seleccionado y duplicar el paso. Reproducir; al editar un campo se pausa. Deshacer restaura texto y duración. «Opciones avanzadas» mantiene pistas, estados, encuadres y escenarios. Comprobar nombres, contraste, zoom y tamaño de controles con una persona sin experiencia; registrar dónde duda y repetir en una pantalla pequeña.

### Inicio guiado, controles contextuales y concentración (ADR 070–072)

`npm run check` **123/123** y `npm run smoke` **45/45**, sin errores de consola. El smoke extiende la regresión con cuatro recorridos: empezar/escribir/recargar, ejemplos reales sin reemplazo, acciones contextuales con undo/IDs/conexión por clic y teclado/cancelación, y concentración sin cambios de contenido ni preferencias. También verifica límites horizontales del inicio y ejemplos en 390×844. Gateway de demostración aislado: no prueba un proveedor real ni consume IA paga. Capturas revisadas: `evidencias/ui-inicio-guiado.png`, `ui-ejemplos-cotidianos.png`, `ui-controles-contextuales.png`, `ui-concentracion.png`, `ui-inicio-movil.png` y `ui-ejemplos-movil.png`; además, login con pistas en oscuro y layouts tablet/móvil. La primera corrida obtuvo 42/45: buscaba el texto vacío anterior, abortó la comprobación de pestañas y dejó una pestaña extra que provocó los otros dos fallos. Se actualizó esa comprobación para la bienvenida y la corrida completa posterior aprobó. La observación de usuarios reales sigue pendiente.

22. **Primer minuto:** «＋ Nueva idea» muestra Contame tu idea, Dibujar y Elegir un ejemplo. Contame tu idea lleva al asistente/acceso sin enviar nada. Dibujar pide tocar el lienzo y permite escribir; recargar conserva la nota y su ID. Idea, tarea y viaje se abren editables en otra pestaña, sin tocar el trabajo anterior. ? ofrece el tutorial opcional. Repetir en un teléfono; ejemplos y bienvenida se desplazan sin recortar botones.
23. **Editar desde el elemento:** seleccionar, Escribir y confirmar. Color cambia sólo lo seleccionado, Duplicar conserva originales, Unir permite elegir otro elemento sin arrastrar. Probar destino con clic y con foco/Enter. Esc/Cancelar o cambiar herramienta cancelan sin crear una conexión. Ctrl+Z restaura cada modificación. Flechas/Home/End recorren la barra sin mover elementos; Más abre Propiedades. La barra se oculta durante movimiento, edición, reproducción y propuestas pendientes.
24. **Concentrarse y volver:** abrir un panel y Editar pasos; tocar Concentrarme o Shift+F. Deben quedar lienzo, encuadre/zoom, reproductor y Presentar. Reproducir/pausar siguen funcionando. Volver al editor o Esc restaura el panel y la animación abiertos; si estaban cerrados, siguen cerrados. Documento, cámara e historial se conservan. En un campo de texto se mantienen sus atajos. Pedir a una persona sin experiencia que haga estos recorridos sin instrucciones y registrar las dudas.

### Inserción fiel, lápiz, selección y color (ADR 073–075)

Ajuste posterior (03/10/2026): blanco como color inicial del lápiz. `npm run build -w @diagramia/editor` correcto (TypeScript y Vite); advertencia de tamaño de bundle conservada. No se repitió el smoke para este cambio de valor inicial. Al recargar, comprobar blanco en la muestra, vista previa y trazo final del punto 26.

`npm run check` **129/129** y `npm run smoke` **49/49**, sin errores de consola. Los checks agregan tres pruebas de geometría/persistencia del core y tres del contrato del reconocedor local. Browser agrega cuatro recorridos: inserción con forma/icono/color y edición transparente, círculo/punto/trazos/color visible/muestras persistidas, formas por mantener/Shift/cancelación, goma/conversión/undo. La paleta del lápiz queda dentro del canvas en móvil; la contextual deja visible el trazo elegido cuando hay espacio al costado. Se conserva la regresión de diagramas complejos, claro/oscuro y tablet/móvil, con gateway mock aislado en 8788 y Vite 5174. No se llamó IA paga.

Capturas revisadas: `evidencias/ui-insercion-fiel.png`, `ui-lapiz-color-real.png`, `ui-lapiz-guiado.png`, `ui-color-seleccionado.png`, `ui-lapiz-movil.png` y `ui-escritura-texto.png`. La primera corrida completa obtuvo 47/49 por un helper de prueba declarado después de las comprobaciones nuevas; se movió a la sección compartida. La prueba enfocada encontró la paleta abierta al cambiar de herramienta; se corrigió para cerrarla al elegir/cambiar. Prueba enfocada posterior 6/6 y regresión final 49/49. El reconocimiento del dispositivo se prueba por contrato; en el Windows probado la API local no está disponible, así que la prueba verifica entrada manual y reemplazo editable. No certifica reconocimiento automático en español. Referencia del adapter: [Chrome Handwriting Recognition](https://developer.chrome.com/docs/web-platform/handwriting-recognition). No hay envío de escritura al gateway.

**Corrección del guiado (ADR 076, 03/10/2026):** `npm run check` **130/130**; `npm run smoke` estable **50/50**, sin errores de consola ni excepciones. Prueba del core con temblor, extremos inmutables y rechazo de arco abierto; reducción perceptible del temblor sin aplanar curvas. Recorrido nuevo de navegador: línea y círculo emprolijados al soltar sin espera, color inicial blanco, undo, rectángulo preparado mientras el puntero tiembla y ausencia de commit antes de soltar; lápiz libre conserva los puntos originales. Capturas revisadas `evidencias/ui-guiado-automatico.png` y `ui-guiado-feedback.png`. Se mantiene la regresión completa y tablet/móvil. Gateway mock en 8788 y editor en 5174; sin IA paga. La primera corrida obtuvo 44/50 por no autorizar el origen 5174 en el gateway aislado; la segunda 38/50 porque una compilación simultánea recargó Vite durante los gestos. Se corrigió la configuración del entorno y se repitió después de terminar el build, con 50/50. Logs locales ignorados: `state/guided-check-final.log` y `state/guided-browser-stable.log`. Pendiente: prueba manual 27 con mouse/táctil/stylus físicos y trazos reales del usuario; no se certifica reconocimiento ni refinamiento de letras.

25. **Objeto real desde el comienzo:** elegir nota, globo, ventana, clase o cualquier forma; presionar, soltar y escribir. La misma forma, icono, detalles y colores permanecen; sólo cambia el título. Confirmar con Enter, cancelar con Esc, volver a editar con doble clic. Seleccionar varios objetos debe marcarlos por fuera sin teñirlos de azul.
26. **Lápiz y color:** Lápiz/D, elegir color y grosor antes de dibujar; hacer un círculo que cierre justo donde empezó, un punto y varios trazos. Se ven continuos y del color elegido durante y después del gesto. Listo/Esc permite seleccionar: cambiar Color debe verse inmediatamente, con borde externo. Guardar un HEX propio, recargar y reutilizarlo. Deshacer color y Emprolijar conserva los IDs y recupera puntos. Repetir en móvil con paleta abierta y con un stylus físico.
27. **Guiado y ayudas (ADR 076):** Guiado/G; dibujar una línea con temblor, rectángulo o círculo/óvalo y soltar enseguida: debe emprolijarse automáticamente. Repetir manteniendo 450 ms con pequeños movimientos: muestra la forma y su nombre, sin guardar antes de soltar. Continuar dibujando recupera el trazo suavizado; al soltar se evalúa el gesto completo. Un arco abierto debe conservar su curva; el guiado no interpreta letras. Lápiz/D conserva la geometría original, sin convertir formas. Color inicial blanco conservado. Línea/Flecha + Shift endereza a horizontal/vertical/45°. Goma/E borra trazos y Ctrl+Z los recupera con el mismo ID. Usar este lápiz carga el color/grosor de un trazo seleccionado. Una selección rectangular puede incluir varios trazos.
28. **Pasar a texto:** seleccionar uno o varios trazos, Pasar a texto. En un dispositivo con reconocimiento local de español, revisar la sugerencia; en uno sin soporte, escribir el texto. Cancelar conserva exactamente el dibujo. Reemplazar crea texto editable en una transacción; undo recupera los trazos. Cambiar el documento mientras se revisa impide aplicar una conversión obsoleta. No afirmar reconocimiento de letras estilo Apple por disponer del botón o suavizado: falta una prueba real con español y handwriting del usuario.

### Piezas mixtas, organización y conexiones (ADR 077–079)

`npm run check` **139/139**, `npm run schemas` correcto y regresión Chromium **53/53**, sin errores de consola ni excepciones. Nueve pruebas nuevas del core: migración 1.7/IDs, grupos mixtos anidados/referencias/poda, preview/movimiento/rutas manuales, copia entre documentos/grupos, zonas sin doble desplazamiento, assets de imágenes/copiar-cortar-pegar, guías y alineación/distribución de piezas. Navegador: grupo figura+dibujo con movimiento desde el trazo, copiar/pegar/duplicar/nudge, undo/IDs/reload y móvil; Acomodar, separación, guías sin commit y Alt; puntos de conexión con drag/clic/teclado/toques simulados, destino y Esc. Se conserva la regresión de diagramas complejos, animación, exportación/importación, claro/oscuro, tablet/móvil y nombres accesibles. Gateway mock aislado 8788, Vite 5174, sin llamada a IA paga.

La primera corrida obtuvo 49/53: faltaba la tecla 0 en el helper del navegador y la salida automática de la conexión rápida había cambiado el flujo de la herramienta C. Se corrigieron ambos; prueba enfocada 5/5 y regresión posterior 53/53. Revisión visual detectó un borde nativo negro al enfocar dibujos: se corrigió sin perder foco visible con teclado. Luego Propiedades se unificó con Acomodar para mantener grupos; comprobación enfocada final **5/5**, incluyendo alineación de piezas mixtas desde Propiedades y C/puertos/teclado/toques. Capturas revisadas: `evidencias/ui-pieza-mixta.png`, `ui-acomodar.png`, `ui-guias.png`, `ui-conectar.png`, `ui-pieza-movil.png`, `ui-puntos-conexion.png`. Gateway habitual reiniciado y /health sano declara schema 1.8.0; editor 5173 conservado. Logs ignorados: `state/pieces-check-complete.log`, `state/pieces-browser-release.log` y `state/pieces-browser-complete-focused.log`. No certifica dispositivos físicos ni lectores de pantalla.

29. **Una pieza completa:** crear texto/figura y dibujo; seleccionar con Shift o rectángulo, Agrupar. Mover desde el dibujo: todo acompaña con las mismas distancias. Flechas también mueven todo. Copiar/Pegar en otra pestaña y Duplicar conservan colores/grupo/imagenes/rutas, con IDs nuevos; Ctrl+Z devuelve cada paso. Recargar conserva el grupo. Desagrupar libera las partes; Alt selecciona una parte. Repetir con táctil y stylus reales.
30. **Acomodar:** seleccionar dos o más piezas/grupos y alinear desde Acomodar y Propiedades. Los grupos se mueven completos y vecinos ajenos no cambian. Con tres piezas, aplicar separación uniforme y deshacer. Al arrastrar cerca de centros/bordes, aparecen guías y ajusta suavemente; Alt o apagar grilla libera ayudas. Nada se guarda antes de soltar. En móvil, controles y piezas deben seguir visibles sin desborde horizontal.
31. **Conectar sin aprender la herramienta:** seleccionar una figura y usar + por arrastre o dos clics/toques. El destino se resalta y aparece su nombre, con una flecha previa; soltar sobre el destino confirma un enlace editable, con el puerto elegido. Esc durante el arrastre o la elección cancela sin crear contenido. Enter/Espacio en el punto y luego Enter sobre el destino funciona con teclado. C mantiene su flujo de herramienta para varias conexiones; Esc vuelve a seleccionar con la conexión reciente conservada. Verificar undo, claro/oscuro y táctil físico.
