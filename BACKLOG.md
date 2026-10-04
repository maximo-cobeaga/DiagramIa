# Backlog

Fuente estructurada: docs/development-plan.json (cada microfase lleva `status` y `evidence`). No cambiar status sin evidencia. Ordenar por dependencia, no sólo por facilidad visual.

## Menos texto y preguntas de IA (03/10/2026)

- **P3.3/P3.4/P8.1, extensión implementada (ADR 081–082):** ayuda de herramientas bajo demanda; quitada la frase permanente de alcance/Admin; selector sólo con múltiples proveedores. Preguntas antes de acciones en los siete modos, prioridad sobre borradores inválidos, Responder/Cancelar, continuación con modo/pedido original y documento/selección actuales, chat separado por pestaña. Sin cambios canónicos ni dependencias.
- **Costo:** muestra del usuario registrada en docs/USO_DEEPSEEK.md (USD 0,05 / 24 solicitudes / 404.998 tokens). Promedios observados, sin configurar tarifas ni modificar recibos. Preguntas del modelo pueden consumir tokens/créditos.
- **Comprobación:** check final 145/145, contratos 37/37, browser enfocado 3/3 y regresión 57/57, sin errores de consola. Capturas revisadas en evidencias/ui-ia-pregunta.png, ui-texto-reducido.png y ui-chat-simple-movil.png. Gateway habitual actualizado y sano; editor 5173 conservado.
- **Próximo paso:** VALIDATION.md 34–35 con DeepSeek real y personas/dispositivos físicos. Sin consumo pago en QA. P3.4 conserva implemented; P8.1 permanece parcial. La ventana acotada retiene el pedido raíz y los dos turnos más recientes; no todos los intercambios de una conversación larga.

## Buscar y recuperar la vista (03/10/2026)

- **P1.1/P8.1, extensión implementada (ADR 080):** buscador local por nombre/detalle/contexto, grupos, zonas, encuadres, conexiones y tipos de dibujo. Tildes/caso, todos los términos, orden por nombre, paginación, teclado y estados vacíos. Acercar y resaltar sin seleccionar ni modificar contenido; Ver selección/Shift+1 y regreso a la cámara previa.
- **Comprobación:** check 141/141, prueba enfocada 5/5 y regresión estable 56/56, sin errores de consola. San Pancho real, móvil/oscuro, reducción de movimiento, pausa del recorrido, grupos sólo de trazos, etiquetas como texto, aislamiento por pestaña y documento idéntico comprobados. Capturas en evidencias/ui-buscar-*.png. Sin schema/dependencias/IA paga. Ver VALIDATION.md 32–33.
- **Próximo paso:** revisión manual con usuarios y dispositivos reales. P8.1 sigue parcial; buscar no interpreta lo escrito en trazos ni sustituye el reconocimiento pendiente.

## Piezas, organización y conexiones (03/10/2026)

- **Orden aprobado implementado, P1.1/P1.3/P8.1 (ADR 077–079):** figuras/textos/dibujos seleccionables y movibles juntos; grupos mixtos persistentes; copiar/pegar/duplicar con rutas, grupos e imágenes conservados. Guías al mover y «Acomodar»/Propiedades alinean piezas completas; Alt libera ayudas. Cuatro puntos + para conectar con drag, clics/toques o teclado, destino visible y cancelación.
- **Modelo y evidencia:** schema 1.8.0 y migración aditiva, ejemplos y JSON Schemas actualizados. Check 139/139; Chromium completo 53/53 sin errores de consola y comprobación enfocada final 5/5, incluyendo alineación en Propiedades. Capturas revisadas en evidencias/ui-pieza-mixta.png, ui-acomodar.png, ui-guias.png, ui-conectar.png, ui-pieza-movil.png y ui-puntos-conexion.png. Gateway local habitual actualizado y sano en schema 1.8.0; sin push, despliegue, nuevas dependencias ni IA paga en QA.
- **Próximo paso:** revisión manual 29–31 con usuario y dispositivos físicos; P8.1 permanece parcial. Grupos incluyen figuras/dibujos; las conexiones semánticas siguen vinculadas a figuras. Distribuir puede conservar solapamientos si ya estaban presentes. Refinamiento automático de escritura pendiente.

## Revisión de inserción y dibujo (03/10/2026)

- **Feedback aplicado (ADR 076):** guiado con formas automáticas al soltar, suavizado por distancia, vista previa tolerante al temblor e indicación de forma reconocida. Check 130/130; navegador estable 50/50 sin errores de consola, capturas `evidencias/ui-guiado-automatico.png` y `ui-guiado-feedback.png`. Próximo paso: revisión manual 27 con el usuario; P8.1 sigue parcial y no se certifica refinamiento de letras.
- **Ajuste solicitado:** blanco como color inicial del lápiz. TypeScript/build del editor correctos; revisión manual 25–28 pendiente.
- **P1.1/P8.1, alcance implementado (ADR 073–075):** objeto real al insertar/escribir; color exacto con selección externa; lápiz sin guía punteada, círculos cerrados, puntos y trazos continuados; paleta compartida de 24 tonos/muestras propias; grosor, goma, Shift, emprolijar y reutilizar lápiz. Guiado geométrico por mantener y conversión a texto con revisión/undo. Pruebas y capturas en `VALIDATION.md`.
- **Evidencia:** check 129/129 y navegador 49/49, sin errores de consola; inserción, colores, lápiz/guiado, goma/texto, persistencia/IDs/undo y paleta móvil. Se conservó la regresión de diagramas complejos, modo oscuro, tablet y móvil. Capturas `evidencias/ui-insercion-fiel.png`, `ui-lapiz-color-real.png`, `ui-lapiz-guiado.png`, `ui-color-seleccionado.png`, `ui-lapiz-movil.png`, `ui-escritura-texto.png`.
- **Reconocimiento de escritura, alcance parcial:** adapter local con contrato, soporte de español y timeout; si el dispositivo no lo ofrece, permite escribir el texto. Reconocimiento automático general/refinamiento de letras como Smart Script necesita motor y validación real; no está certificado por un mock ni por suavizar puntos.
- **Próximo paso:** revisión manual 25–28 y prueba con mouse/táctil/stylus. Conservar P8.1 parcial por usabilidad y accesibilidad real. No agregar instrumentos sólo para ampliar el catálogo.

## Inicio, acciones cercanas y concentración (03/10/2026)

- **Orden solicitado implementado, P8.1/P1.1 (ADR 070–072):** bienvenida en un canvas vacío, tres entradas claras y ejemplos cotidianos reales; barra contextual para escribir/colorear/duplicar/conectar; concentración reversible con paneles y contenido conservados. Sin modal obligatorio ni envío automático de IA.
- **Evidencia:** `npm run check` 123/123 y `npm run smoke` 45/45, sin errores de consola; capturas en `evidencias/ui-inicio-guiado.png`, `ui-controles-contextuales.png`, `ui-concentracion.png`, `ui-ejemplos-cotidianos.png` y variantes móviles. Persistencia, IDs, undo, conexión por clic/teclado y preferencias comprobados. Sin cambios de schema o dependencias.
- **Próximo paso:** revisión manual 22–24. Mantener P8.1 parcial hasta observar personas reales y revisar accesibilidad/dispositivos físicos; aplicar el feedback antes de sumar complejidad.

## UI más clara y animación compacta (03/10/2026)

- **P8.1/P2.1, mejora implementada (ADR 069):** reproductor pequeño por defecto; «Editar pasos» abre el panel y «Bajar panel» libera el lienzo. Altura ajustable con mouse, táctil o teclado; tarjetas de pasos, duración en segundos y edición habitual separada de opciones avanzadas. Editar pausa la reproducción. Se conservan acciones, undo, pistas, ramas y cámara del documento.
- **Identidad y legibilidad:** superficies separadas, nombres cotidianos, herramientas y formas con texto más legible, bienvenida del asistente y tutorial actualizados. Desktop/tablet/móvil y modo oscuro conservados.
- **Evidencia:** `npm run check` 123/123 y `npm run smoke` 41/41; edición de texto/segundos con teclado real y undo, panel ajustable sin cambios del documento, nombres accesibles, claro/oscuro y tamaños desktop/tablet/móvil. Capturas en `evidencias/ui-editor-compacto.png` y `evidencias/ui-animacion-simple.png`.
- **Próximo paso:** probar los puntos 20–21 de `VALIDATION.md`, especialmente con una persona que no conozca el editor. P8.1 sigue parcial hasta la revisión real de usabilidad, dispositivos y accesibilidad.

## Recuperación de la última sesión de Claude (03/10/2026)

- **P2.3, extensión implementada (ADR 067):** cámara por paso con enfoque y transición, seguimiento opcional en el editor, presentación y PDF con encuadre compartido; pausa, gestos y pestañas cancelan viajes pendientes; reduced-motion. Schema 1.7.0, migración, contratos y ejemplos actualizados. Falta revisión manual del usuario.
- **P4.4, excepción admin implementada (ADR 068):** cuenta con email verificado en `DIAGRAMIA_ADMIN_EMAILS` sin cuota Free ni límite por minuto; sigue el presupuesto global. Recibos de cero créditos durables mediante SQL 006, probados con PostgreSQL real. P4.4 conserva sus pendientes económicos/de producción.
- **Viaje solicitado:** `examples/san-pancho.diagramia.json`, disponible en el selector del editor; 29 elementos, 6 zonas, 18 pasos y escenarios de noviembre 2026, febrero y mayo 2027. Fuentes, supuestos, itinerario y presupuestos en `docs/VIAJE_SAN_PANCHO.md`. Falta cotizar disponibilidad real; no hay reservas.

Próximo paso de este alcance: revisar a mano los puntos 17–19 de `VALIDATION.md`. El resto de P1.7 sigue esperando la decisión de mapas reales.

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
- Schema 1.8.0 (ADR 067 agrega enfoque/transición por paso; ADR 077 grupos de figuras y dibujos): formas básicas, de flujo y UML, iconos grandes, estilos, enganches y pistas editables. El layout separa nodos y reserva espacio para etiquetas, pero rutas manuales/curvas y cruces entre conexiones aún pueden superponerse; no existe garantía universal de ausencia de cruces.
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
- Smoke cubre pan, portapapeles de piezas mixtas, conexiones por toque simulado, teclado, búsqueda y edición de pasos por UI. Siguen pendientes pinch/táctil/stylus físicos, teclado asistido y lectores de pantalla: revisarlos a mano. El catálogo móvil se pliega para mostrar el canvas, pero el zoom inicial puede dejar texto pequeño.
- MANIFEST.json describe el ZIP original; no se regeneró y sus hashes ya no coinciden con el árbol actual.
