# Documento, acciones y consistencia

Fuente de verdad ejecutable: `packages/core/src` (`schema.ts`, `engine.ts`, `geometry.ts`, `layout.ts`, `library.ts`). Contratos generados: `schemas/document.schema.json` y `schemas/action-batch.schema.json` (`npm run schemas`). Referencias completas: `examples/*.json`. El JSON Schema sirve para generación/validación estructural; el engine además valida referencias, pertenencia a zonas, grupos, revisiones, límites y otros invariantes que JSON Schema no expresa.

## Documento, schema 1.8.0

`schemaVersion`, `id`, `title`, `revision`, `nodes`, `edges`, `drawings`, `zones`, `groups`, `frames`, `animations`, `assets`, `annotations`, `appliedBatches`.

- **Node:** id, kind, label, position, size, `zoneId`, `groupId`, subtitle, `assetId`, `icon`, `shape`, `style` y `details`. Tipos semánticos: service, database, cache, queue, external, actor, decision, note, text, image, custom. `shape` elige una forma básica, de flujo o UML; `style` conserva relleno, trazo y texto editables. Un nodo con `assetId` dibuja esa imagen; `icon` es uno de los glifos de `ICONS`.
- **Edge:** extremos por ID, label, `alternative`, `fromPort`/`toPort` (auto, top, right, bottom, left), `fromAnchor`/`toAnchor` sobre cualquier punto del borde, puntas, estilo, línea ortogonal/recta/curva y `points` opcionales (ruta manual).
- **Zone:** id, label, bounds. **Frame:** id, label, bounds (encuadre de cámara para presentar). **Group:** id, label, `parentId` (anidamiento; los miembros se indican con `groupId` en cada nodo o dibujo). **Drawing:** id, kind (line/arrow/freehand), points, style y `groupId` nullable, libre por defecto.
- **Animation:** id, label, `scenarios` (id, label, description), steps y tracks. **Step:** id, caption, durationMs, nodeIds, edgeIds, tone, `frameId`, `scenarioIds` (vacío = ocurre en todos los escenarios), `states` (nodeId, label, tone), `focus` y `transition`. **Track:** highlight, caption o camera; sus clips se vinculan por `stepId`.
- **Asset:** id, label, mediaType (PNG, JPEG, WebP, SVG), `data` en base64, width, height. Máximo 400 KB y 40 por documento.
- **Annotation:** id, `targetId` (elemento o null = documento), severity (info, warning, risk), text, suggestion, source (user, ai), resolved.

Invariantes: IDs únicos entre nodos, conexiones, zonas, grupos, frames, animaciones, assets y anotaciones; cada escenario tiene al menos un paso; los estados y anotaciones refieren elementos existentes; `assetId` refiere un asset del documento; pasos únicos dentro de cada animación; un nodo con `zoneId` debe caber dentro de esa zona; grupos sin ciclos y con padre existente; referencias inexistentes se rechazan; animación de hasta diez minutos; coordenadas finitas y acotadas; arrays con límites (ver `CAPABILITIES.limits`). Archivos de hasta 3 MB.

## Versiones y migración

`openDocument(input)` abre las versiones de 1.0.0 a 1.8.0 (`READABLE_VERSIONS`), las migra en memoria sin tocar IDs ni geometría y devuelve `{document, migratedFrom}`. `validateDocument` acepta sólo la versión vigente. Una versión desconocida falla con `UNSUPPORTED_VERSION`; el editor conserva el contenido original, pausa el guardado y ofrece exportarlo. Cada migración nueva se agrega a `MIGRATIONS` en `engine.ts` con pruebas de conservación de contenido. De 1.6.0 a 1.7.0, los pasos sin cámara reciben `focus: auto` y `transition: smooth`; la revisión y el historial permanecen iguales.

`CAPABILITIES` enumera versión, acciones, tipos, puertos y límites reales. El MCP lo devuelve en `get_schema` y el gateway lo incluye en el prompt de sistema. No anunciar operaciones fuera de esa lista.

## Lote

```json
{"id":"proposal-42","baseRevision":12,"actions":[{"type":"MOVE_NODE","id":"api","placement":{"inside":"backend","below":"frontend","gap":40}}]}
```

Sólo es válido si esos IDs existen y el resultado cabe dentro de la zona. Ejemplo ejecutable: `examples/add-redis.actions.json` (para architecture r0).

| Acción | Efecto |
|---|---|
| `UPDATE_DOCUMENT` | Cambia el título |
| `ADD_NODE` | Nodo completo; `placement` relativo opcional |
| `UPDATE_NODE` | Cambios parciales; los campos omitidos se conservan. ID inmutable |
| `MOVE_NODE` | `position` XOR `placement` |
| `MOVE_NODES` | Desplaza varios nodos por `dx`, `dy` |
| `RESIZE_NODE` | Tamaño y, opcionalmente, posición |
| `DELETE_NODE` | Elimina sus conexiones y poda referencias de animación |
| `ADD_EDGE` / `UPDATE_EDGE` / `DELETE_EDGE` | `UPDATE_EDGE` con `points:null` vuelve a la ruta automática; cambiar extremos o puertos también |
| `CREATE_ZONE` / `UPDATE_ZONE` | Label y límites; achicar por debajo de sus nodos se rechaza |
| `MOVE_ZONE` | Mueve la zona junto con sus nodos |
| `DELETE_ZONE` | `members: release` (por defecto) libera los nodos; `delete` los elimina |
| `CREATE_GROUP` / `UPDATE_GROUP` / `DELETE_GROUP` | `nodeIds` y `drawingIds` opcionales, al menos un miembro y hasta 500 entre ambos; IDs únicos. Agrupar piezas ya agrupadas anida su grupo raíz; desagrupar devuelve figuras y trazos al grupo padre; un grupo vacío desaparece |
| `CREATE_FRAME` / `UPDATE_FRAME` / `DELETE_FRAME` | Eliminar un frame deja `frameId: null` en los pasos que lo usaban |
| `CREATE_ANIMATION` / `UPDATE_ANIMATION` / `DELETE_ANIMATION` | |
| `ADD_STEP` / `UPDATE_STEP` / `MOVE_STEP` / `DELETE_STEP` | Edición de timeline. No se puede eliminar el último paso (`EMPTY_ANIMATION`) ni dejar un escenario sin pasos (`EMPTY_SCENARIO`) |
| `ADD_SCENARIO` / `UPDATE_SCENARIO` / `DELETE_SCENARIO` | Ramas de una animación. Eliminar un escenario elimina sus pasos exclusivos y lo quita de los compartidos |
| `ADD_ASSET` | Imagen nueva. Debe venir en el mismo lote que un nodo que la use (`UNUSED_ASSET`). No hay `DELETE_ASSET`: el asset desaparece cuando ningún nodo lo usa |
| `ADD_ANNOTATION` / `UPDATE_ANNOTATION` / `DELETE_ANNOTATION` | Observaciones sobre un elemento o el documento |
| `ALIGN_NODES` / `DISTRIBUTE_NODES` / `LAYOUT_NODES` | Sólo mueven los nodos listados; resultado determinista |
| `ARRANGE_DOCUMENT` | Reordena el documento completo, incluidas zonas y sus miembros, cuando se pide explícitamente o el ordenador de propuestas lo necesita |

**Placement:** sin `inside`, un nodo ubicado junto a otro hereda la zona de ese vecino si cabe en ella. `inside` (ID de zona) o `insideLabel` (label; con zonas homónimas falla con `AMBIGUOUS_ZONE` y lista los IDs), más a lo sumo una referencia entre `below`, `above`, `rightOf`, `leftOf`, y `gap`. Si el lugar está ocupado se avanza en la misma dirección hasta quedar libre; si no hay lugar dentro de la zona, `NO_SPACE` con explicación.

Pendientes: variables y triggers con expresiones, constraints persistentes de layout, storage externo de assets. No anunciarlos como soportados.

## Animación: escenarios y estados

`resolveScenario(animation, scenarioId)` devuelve la rama: pasos comunes más los del escenario, en orden. `statesAt(animation, index)` devuelve el estado de cada nodo al llegar a ese paso (gana la última asignación del recorrido). Varios `edgeIds` en un paso se recorren en paralelo. Todo es determinista y descriptivo: no se evalúan expresiones ni se ejecuta ningún sistema.

## Cámara por paso (1.7.0, ADR 067)

`stepCamera(document, animation, index)` calcula el encuadre de forma determinista. `focus` admite auto (mitad del diagrama como contexto mínimo), close (lo resaltado con margen), medium (30 % de contexto mínimo), wide (50 %), overview (todo el contenido, incluidos trazos) y stay (encuadre del paso anterior de la rama visible). Una pista camera con frame tiene prioridad sobre el frame del paso; un frame manda sobre focus. Los resaltados de pistas highlight se incluyen. Sin elementos resaltados se muestra todo.

`transition` admite smooth (900 ms), slow (1800 ms) y cut (0 ms). Editor y presentación usan el mismo encuadre; el PDF de presentación conserva el destino de cada paso. El seguimiento del editor es opcional. Pausar detiene el viaje en curso; pan, zoom y cambio de pestaña cancelan el movimiento pendiente. Reduced-motion aplica el destino directamente. El encuadre, el tiempo y la preferencia de seguimiento son estado de interfaz: sólo editar la intención de cámara del paso genera una acción y una revisión.

## Assets: contenido y seguridad

`inspectAsset` verifica tamaño, firma del formato y, para SVG, que sea estático (sin `script`, manejadores `on*`, `foreignObject`, `use`, `image`, enlaces ni `url()` externos). Se ejecuta al agregar y al abrir un documento. El editor dibuja todo asset con `<image>`, donde el navegador no ejecuta scripts ni hace pedidos. El ledger de idempotencia guarda la huella de la imagen, no su contenido. `getContext` describe los assets (tipo, tamaño) sin incluir `data`.

## Atomicidad

`applyBatch` valida entrada, clona el documento, ejecuta el lote y valida el resultado completo. Un fallo no muta el original e indica el número y tipo de la acción que falló. `revision` incrementa una vez por lote válido. Una referencia inexistente en una acción nueva falla; sólo las eliminaciones podan referencias de animación, y `previewBatch`/`prunedReferences` informan qué pasos las perdieron para revisar sus textos.

## Idempotencia

Se guarda el ID del lote y una representación canónica de las acciones, hasta 100 lotes. Mismo ID y contenido: se devuelve el documento sin una segunda modificación. Mismo ID con otro contenido: `IDEMPOTENCY_CONFLICT`. Es un mecanismo acotado: no garantiza idempotencia para reintentos arbitrariamente antiguos. El gateway de IA usa el `requestId` como ID del lote propuesto y recuerda en memoria los pedidos completados. P4 debe persistir recibos en DB.

## Concurrencia

Un lote con `baseRevision` diferente falla (`REVISION_CONFLICT`), salvo retry ya reconocido. En el editor, una propuesta de IA calculada sobre una revisión anterior se muestra como obsoleta y se regenera; nunca pisa trabajo manual. El MCP usa lock durante read/apply/write y rename de temporal; eso no protege contra otra aplicación que escriba el archivo directamente. Dos pestañas del editor sobre el mismo almacenamiento se avisan entre sí en vez de pisarse en silencio. El backend debe reemplazar estos patrones por transacciones CAS de DB.

## Historial

Undo restaura contenido de snapshots con una revisión nueva y conserva el ledger reciente: las revisiones no retroceden. Historial sólo de sesión, 100 pasos; al descartar los más antiguos se informa. Importar o cargar un ejemplo reemplaza el documento y se puede deshacer. El playhead, la cámara y la selección no forman parte del historial.

## Geometría

Conexiones con `points` conservan su ruta; al mover o redimensionar un nodo se invalidan las rutas incidentes. Sin `points`, `routeAll` calcula rutas según el tipo de línea y los puertos o enganches elegidos. Las ortogonales evitan nodos y separan salidas compartidas; el layout reserva espacio según el ancho de las etiquetas. `findOverlaps` detecta nodos, zonas, texto y etiquetas que se pisan y conexiones que atraviesan nodos. No hay garantía general contra todos los cruces entre conexiones ni para rutas manuales y curvas.

**Pertenencia al mover (editor):** al soltar, el nodo pertenece a la zona más chica que contiene su centro y en la que cabe (su posición se ajusta para quedar adentro); fuera de toda zona queda libre. Una zona dibujada adopta los nodos sin zona que queden completamente adentro.

## Contexto para IA

`getContext(doc, selectedIds, {scope, maxElements})`. `scope: selection` devuelve los elementos elegidos, sus vecinos directos, sus zonas y un listado `otherZones` (ID + label) para que el modelo pueda nombrar zonas sin adivinar entre homónimas. `maxElements` recorta conservando el foco e informa `truncated` y los totales.

## Biblioteca

`ComponentSchema`/`LibrarySchema` (`libraryVersion: 1.0.0`). `instantiateComponent` genera acciones con IDs `local-N`, donde N es el menor sufijo libre en el documento: instanciar dos veces no colisiona y es determinista.

## Gateway de IA (`apps/api`)

`GET /health`, `GET /ready`, `GET /v1/providers`, `GET /v1/usage`, `POST /v1/assist`. `/ready` indica inicialización local completa; aún no comprueba DB porque el gateway no depende de ella hasta P4.2. Pedido: `requestId`, `providerId`, `mode` (create, edit, transform, animate, explain, review, document), `prompt`, `document`, `selectedIds` y `history` (hasta 8 mensajes de texto alternando user/assistant; el documento sólo viaja en el turno actual). Respuesta según `kind`: `proposal` (lote + diff, sin aplicar), `clarification`, `text`, `review` (observaciones con `targetId` existente). Siempre incluye modelo, uso de tokens, costo estimado con su base (`published-price-estimate`, `local-no-charge`, `unknown-price`, `none`), reparaciones y si fue un resultado repetido.

Zonas homónimas: si el pedido nombra un label que comparten varias zonas y ni la selección ni un ID escrito designan una, la respuesta es `clarification` con `provider: engine` y cero llamadas. Si el usuario eligió una, una propuesta que ubique nodos en la homónima se rechaza y se repara.

En modo `create`, el modelo devuelve un inventario JSON de `zones`, `nodes` y `edges` (con `shape`, `details`, estilos y puntas/líneas opcionales); el gateway lo convierte en acciones de `packages/core` y el engine calcula posición, tamaño y rutas. En los demás modos de cambio, el modelo propone acciones canónicas. Geometría incompleta de un `ADD_NODE` se reemplaza por valores provisionales antes de ordenar; IDs, tipos, pertenencia y referencias siguen validados estrictamente. Si ordenar requiere más de 200 acciones, el lote se rechaza completo en vez de recortarse. Un modelo puede omitir relaciones o pedir aclaraciones erróneas: el usuario debe revisar la propuesta antes de aceptarla.

El presupuesto diario limita gasto: sólo lo consumen los proveedores remotos. Los modelos locales y la demostración se registran en el ledger pero no descuentan; el límite de pedidos por minuto rige para todos.

Errores: `BUDGET_EXCEEDED` (402, antes de llamar al proveedor), `RATE_LIMITED` (429), `IN_PROGRESS`/`IDEMPOTENCY_CONFLICT` (409), `PROVIDER_NOT_CONFIGURED` (409), `PROPOSAL_REJECTED`/`INVALID_MODEL_OUTPUT` (422, tras una reparación), `TIMEOUT` (504, sin reintento automático), `CANCELLED`, `REFUSED`, `AUTH`, `UPSTREAM`.

## Preguntas antes de proponer (ADR 082)

Todos los modos admiten una respuesta `kind: clarification`. El gateway reconoce `clarification` no vacía (hasta 2.000 caracteres) antes de interpretar el contenido del modo; si el modelo mezcla pregunta y acciones/inventario, devuelve sólo la pregunta, sin lote, staging ni reparación. Explain/Review incluyen `clarification` nullable en sus formatos estrictos; Document puede devolver un JSON con la pregunta en lugar de Markdown. Las salidas normales anteriores siguen aceptadas.

Responder usa el modo original, el documento y la selección actuales, y una ventana de historial de tres turnos que retiene el pedido raíz y los dos más recientes. No conserva todos los intercambios intermedios de una conversación larga. Cancelar excluye ese turno del contexto; cambiar documento reinicia el chat. Preguntar no cambia contenido, IDs, revisión ni historial; las propuestas posteriores siguen requiriendo aceptación y revisión optimista. Preguntas remotas se contabilizan con los mismos guards que otras respuestas; reintentar el mismo requestId no duplica el consumo. No cambia el schema canónico ni el contrato de solicitud.

## Errores esperables del engine

REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, DUPLICATE_ID, NOT_FOUND, DANGLING_EDGE, DANGLING_ZONE, DANGLING_GROUP, GROUP_CYCLE, OUTSIDE_ZONE, DANGLING_ANIMATION, ANIMATION_TOO_LONG, EMPTY_ANIMATION, BATCH_TOO_LARGE, INVALID_SELECTION, AMBIGUOUS_ZONE, AMBIGUOUS_PLACEMENT, NO_SPACE, LAYOUT_NEEDS_MORE, UNSUPPORTED_VERSION, INVALID_DOCUMENT, INVALID_COMPONENT, INVALID_MERMAID, DUPLICATE_SCENARIO, EMPTY_SCENARIO, DANGLING_ASSET, UNUSED_ASSET, INVALID_ASSET, UNSAFE_ASSET, ASSET_TOO_LARGE, DANGLING_ANNOTATION. `describeError` y `errorCode` dan el mensaje para el usuario y el código, sin stack traces.

Desde 1.7.0 a 1.8.0 los dibujos reciben `groupId` null sin cambiar IDs, puntos, estilos, revisión ni historial. `selectionMoveActions`/`selectionMovePreview` comparten los efectos para figuras, dibujos, zonas y encuadres; las rutas manuales internas se trasladan con la pieza. `captureSelection`/`cloneSelectionActions` conservan referencias, grupos e imágenes al copiar; sólo las copias reciben IDs nuevos. Guías y destino de conexión son estado de interfaz.
