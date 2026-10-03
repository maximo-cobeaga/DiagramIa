# Backlog

Fuente estructurada: docs/development-plan.json (cada microfase lleva `status` y `evidence`). No cambiar status sin evidencia. Ordenar por dependencia, no sólo por facilidad visual.

Para una lectura rápida del proyecto y las decisiones abiertas: `docs/Estado_Diagramia_MVP.docx`.

El código está publicado en `maximo-cobeaga/DiagramIa` (GitHub, público). El CI remoto de `check` y `database` pasó el 02/10/2026; esto no equivale a desplegar el producto ni cambia los estados de las microfases pendientes.

Orden de ejecución (02/10/2026, ADR 048): **P3.1 con GPT-6 Luna → P7.1/P7.2 medición → P4.1/P4.4 cuenta real y antiabuso → P8.2/P8.3 → P8.4 despliegue → P7.3 dashboard**. Después del lanzamiento: P4.6, P7.4, P4.3, P5.3, P6.4, P2.6 (voz Premium) y P4.7 (comunidad). Higgsfield se retiró del producto (ADR 044).

Estados: **verificada** = criterio de salida comprobado; **implementada** = alcance hecho con checks automáticos, falta revisión manual del usuario o una prueba real bloqueada; **parcial** = falta alcance (ver evidence); **pendiente** = sin empezar.

| ID | Tarea | Estado |
|---|---|---|
| P0.1 | Auditar y ejecutar el starter | verificada |
| P0.2 | Versionado y migraciones | verificada |
| P0.3 | Estado y persistencia recuperable | verificada |
| P1.1 | Interacción de canvas | implementada |
| P1.2 | Zonas y marcadores | implementada |
| P1.3 | Grupos, frames y assets | implementada |
| P1.4 | Routing y layout determinista | implementada |
| P1.5 | Componentes reutilizables | implementada |
| P1.6 | Elementos para todo público y elementos propios | implementada |
| P1.7 | Diseño automático, enlaces y mapas | parcial |
| P2.1 | Timeline editable | implementada |
| P2.2 | Ramas, estados y paralelismo | implementada |
| P2.3 | Cámara y presentación | implementada |
| P2.4 | Plantillas de explicación | implementada |
| P2.5 | Explicación animada por IA | implementada |
| P2.6 | Narración con voz, Premium (post-lanzamiento) | pendiente |
| P3.1 | Gateway local y adapters | implementada |
| P3.2 | Contexto selectivo | verificada |
| P3.3 | Propuestas y staging observable | verificada |
| P3.4 | Modos de IA y anotaciones | implementada |
| P3.5 | Uso, presupuesto y resiliencia | verificada |
| P4.1 | Identidad y proyectos | implementada |
| P4.2 | Documentos y versiones durables | implementada |
| P4.3 | Assets en almacenamiento (post-lanzamiento) | pendiente |
| P4.4 | Free, cuotas y antiabuso | parcial |
| P4.5 | Operación local y CI | verificada |
| P4.6 | Billing y planes pagos (post-lanzamiento) | pendiente |
| P4.7 | Biblioteca de la comunidad (post-lanzamiento) | pendiente |
| P5.1 | Unificar canal de cambios | implementada |
| P5.2 | Transporte remoto y permisos | implementada |
| P5.3 | Capacidades y hosts | pendiente |
| P6.1 | Mermaid y Markdown | implementada |
| P6.2 | draw.io y Graphviz | implementada |
| P6.3 | PlantUML, UML y BPMN | implementada |
| P6.4 | Export visual y artefactos | parcial |
| P7.1 | Eventos y captura | implementada |
| P7.2 | Métricas de IA y feedback | implementada |
| P7.3 | Agregados y dashboard del fundador | implementada |
| P7.4 | Agente Data/Product (post-lanzamiento) | pendiente |
| P8.1 | UX y accesibilidad | parcial |
| P8.2 | Performance y estabilidad | implementada |
| P8.3 | Seguridad y release candidate | parcial |
| P8.4 | Entrega y despliegue autorizado | parcial |
| P8.5 | Revisión del usuario: acceso, chat y enfoque | implementada |

## Revisión manual del usuario (03/10/2026)

`revision-3-10.md` trajo diez puntos. Implementados el mismo día: login visible y pestaña Cuenta, botón del panel con ícono, enfoque y color al tocar una observación (P8.5); chat sin selector de modos, respuestas breves y «Explicar más» (P8.5, ADR 057); explicación animada (P2.5, ADR 058); elementos para todo público, estilos rápidos y elementos propios (P1.6, ADR 059–060). Quedan para después del lanzamiento la voz Premium (P2.6) y la biblioteca de la comunidad (P4.7).

Segunda vuelta, el mismo día. El usuario marcó que los elementos nuevos eran todos iguales, que no se veía lo que iba a ubicar y que el viaje armado por la IA (`evidencias/evi-1.json`) era «triste». Se sumaron formas con diseño propio, vista previa real, diseñador automático con recorrido, «✦ Darle diseño», una distribución que se lee de un vistazo, enlaces y una forma mapa (P1.6, P1.7, ADR 062–064).

Tercera vuelta, el mismo día: menos cruces entre zonas (zonas alrededor de la más conectada, capas desenredadas y curvas que rodean nodos, ADR 065) y vista previa de enlaces a pedido con protección SSRF (ADR 066). Pendiente de P1.7: mapas reales (falta elegir proveedor de teselas) y la revisión manual.

## Límites técnicos conocidos (continuación del 01/10/2026)

- Editor y MCP comparten documentos por PostgreSQL al activar el espacio local; los cambios aparecen mediante polling y CAS con conflicto visible. También hay documentos de cuenta privados. MCP remoto expone Streamable HTTP con token OAuth por usuario, scopes y aislamiento de proyecto; se probó con issuer/JWKS local firmado, falta comprobar Auth0, proxy y dos hosts externos. El MCP stdio conserva el token de servidor.
- Las imágenes viajan dentro del documento (tope 400 KB cada una, 40 por documento): no hay almacenamiento de archivos hasta P4.3. `custom` se dibuja como caja genérica.
- Las ramas de animación son escenarios con nombre; no hay variables ni triggers con expresiones. Las pistas se sincronizan por ID de paso y admiten resaltado, texto y cámara; falta revisión manual de la UX.
- Schema 1.6.0 (ADR 059 amplía los iconos a 49 y agrega iconos grandes): formas básicas, de flujo y UML, estilos, enganches y pistas editables. El layout separa nodos y reserva espacio para etiquetas, pero rutas manuales/curvas y cruces entre conexiones aún pueden superponerse; no existe garantía universal de ausencia de cruces.
- Los grupos no muestran marcador de anotación en el canvas (sí en el inspector).
- El routing ortogonal evita nodos y reparte extremos compartidos; no elimina todos los cruces entre conexiones.
- La IA se probó con un modelo real local (Ollama, qwen2.5-coder:7b). El modo Crear usa un inventario de elementos convertido a acciones por el gateway; dos smokes pasaron con el test básico y otro con verificación estricta de etiquetas y relaciones. Entre ellos, el test estricto detectó etiquetas superpuestas y se corrigió el layout. Ese modelo todavía puede pedir aclaraciones innecesarias o interpretar mal pedidos libres. Claude sigue sin probarse: falta ANTHROPIC_API_KEY. Con la key: `npm run api` y `npm run smoke:ai -- anthropic`.
- Durante prueba manual, el modelo local emitió `kind` no canónicos para un login y recibió 422 sin alterar el documento. El gateway ahora enumera los tipos válidos y traduce alias semánticos cerrados sólo en Crear; el mismo pedido pasó con el modelo real (4 nodos, 5 conexiones, 0 reparaciones). Esto no garantiza todos los pedidos libres.
- Un modelo chico (7B) acierta el pedido de referencia pero tarda 10–20 s por pedido y depende de la reparación del engine; no es una referencia de calidad para el producto.
- El presupuesto global del gateway es por proceso; las cuentas agregan créditos por usuario y recibos durables. No equivale todavía a un límite de gasto de producción medido con un proveedor pago.
- Decisiones del MVP en `DiagramIa_Decisiones_MVP.md`: invitado con pizarra y borrador local, IA/nube con cuenta y nube Free de 3 documentos (10 MB cada uno y 30 MB totales). Se implementó la cuota inicial de 20 créditos por mes y 6 por día; falta medirla y completar Pro/BYOK/facturación. El modelo Free es GPT-6 Luna (`gpt-6-luna`, ADR 045): identificador y API confirmados, falta el adapter con structured outputs y medir costo real.
- Schema 1.5.0 conserva los trazos libres independientes (línea, flecha y mano alzada) y agrega pistas de animación. SVG conserva los trazos; Mermaid, DOT y draw.io informan su pérdida. Falta revisar visualmente mouse y táctil.
- Los recibos del gateway siguen en memoria en modo local; las cuentas guardan recibos de crédito durables y reintentos por usuario. Los recibos de lotes PostgreSQL sobreviven al límite de 100 del documento.
- Historial de undo sólo de sesión (100 pasos, con aviso al descartar).
- Export: PDF raster del diagrama y PDF por páginas de la presentación; no hay video con tiempo/movimiento. Mermaid y DOT pierden posiciones; draw.io conserva geometría del subset. Los tres formatos reportan lo que no representan. JSON sigue siendo el formato completo.
- PostgreSQL local y el repositorio de documentos pasaron backup/restore aislado con versiones y recibos. Cuentas, proyectos, aislamiento, cuotas, sync local y MCP remoto se probaron con proveedor OIDC/OAuth simulado y PostgreSQL efímero; faltan Auth0 real, hosts MCP externos, billing y BYOK. draw.io, DOT, PlantUML y BPMN cubren sólo los subconjuntos documentados en `docs/INTEROP.md`.
- PlantUML importa clases/secuencia/estados simples y exporta cada tipo; BPMN importa/exporta un proceso básico no ejecutable. Los elementos avanzados se informan o hacen fallar la importación si dejarían referencias rotas. Falta revisión manual con archivos ajenos variados.
- Pan, portapapeles, pinch/táctil, edición de pasos por UI y lector de pantalla no tienen prueba automática: revisarlos a mano. El catálogo móvil se pliega para mostrar el canvas, pero el zoom inicial puede dejar texto pequeño.
- MANIFEST.json describe el ZIP original; no se regeneró y sus hashes ya no coinciden con el árbol actual.
