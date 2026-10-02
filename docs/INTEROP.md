# Intercambio de diagramas

El JSON `.diagramia.json` es el único formato sin pérdidas. Los demás formatos importan o exportan un subconjunto editable y devuelven `InteropReport` con notas y elementos no soportados. Un error de parseo deja el documento abierto intacto en el editor.

| Formato | Se conserva al importar | Se pierde o simplifica |
|---|---|---|
| draw.io `.drawio` / `.xml` | Primera página, IDs válidos, textos, nodos, conexiones, zonas `swimlane`/`container` y geometría. Se acepta XML plano o página deflate/base64. | Páginas extra, grupos, estilos avanzados, rutas, dibujos libres (líneas/flechas/trazos), animaciones, imágenes y anotaciones. HTML en `value` se convierte a texto plano. |
| Graphviz `.dot` / `.gv` | `graph`/`digraph`, nodos, aristas y cadenas, `label`, formas básicas, `rankdir`, `subgraph cluster_*` como zona. | Posiciones (se calcula layout), puertos, defaults, atributos no enumerados, formas sin equivalente, dibujos libres, animaciones y assets. No se ejecuta `dot`. |
| PlantUML `.puml` / `.plantuml` | Subconjuntos de clases (clase/interfaz/enum, miembros simples y relaciones), secuencia (participantes y mensajes) y estados (estados simples, transiciones, inicio/fin). IDs y referencias de relaciones. | Geometría, lifelines, orden temporal exacto, grupos, estados compuestos, macros, includes, estilos y sintaxis avanzada. Toda línea omitida se informa; nunca se ejecutan directivas ni se llama a un renderer externo. |
| BPMN `.bpmn` | Primer proceso: eventos de inicio/fin, tareas básicas/de usuario/de servicio, gateways exclusivos/paralelos, `sequenceFlow`, nombres, IDs y geometría BPMN DI completa. | Semántica ejecutable, extensiones, lanes, subprocesses, condiciones, colaboración y procesos adicionales. Un flujo hacia un elemento omitido se rechaza en vez de dejar referencias rotas. |
| Mermaid flowchart | Nodos, conexiones, zonas y algunas formas; ver `packages/interop/src/mermaid.ts`. | Posiciones, dibujos libres y otras propiedades; se reportan. |
| Markdown | Resumen semántico de nodos, conexiones, trazos (tipo/ID/cantidad de puntos), anotaciones, recorridos y pistas de animación por paso. | No conserva geometría; es documentación, no una copia editable del dibujo. |

La importación draw.io limita XML plano a 500 KB, profundidad a 30 elementos y 8000 celdas. Una página comprimida no puede exceder 500 KB descomprimida. Rechaza DOCTYPE y declaraciones de entidades; el parser SAX no solicita URLs externas. La importación DOT limita texto a 200 KB, 20 000 tokens y 10 niveles de subgraphs. Los IDs ajenos al schema de Diagramia se normalizan con una nota. Ambos parsers validan el documento final en `packages/core` antes de entregarlo.

PlantUML limita 200 KB, 6000 líneas y 1200 caracteres por línea; exige un solo bloque `@startuml`. BPMN limita 500 KB y 40 niveles XML, rechaza DOCTYPE/entidades y valida namespace, IDs y referencias. Ambos validan el documento final con `packages/core`; cualquier error deja abierto el documento anterior. Las entradas de prueba manual están en `examples/uml-classes.puml`, `uml-login-sequence.puml`, `uml-order-states.puml` y `basic-approval.bpmn`.

El export draw.io escribe XML sin compresión para preservar legibilidad y geometría. El export DOT usa clusters para las zonas y calcula el layout al reimportar. El panel de exportación muestra el reporte de pérdidas; usar JSON para guardar la edición completa.

PlantUML exporta el documento como clases, secuencia o estados simples según el formato elegido; no conserva tiempo ni posiciones. BPMN exporta un proceso **no ejecutable** con tareas, eventos, gateways, flujos y geometría básica BPMN DI. Un nodo sin equivalente se simplifica a tarea y se informa. Ninguno de estos archivos sustituye el JSON como respaldo completo.

La exportación de timeline JSON incluye pasos, escenarios y pistas con IDs estables. Es una salida estructurada para integrar o revisar animaciones; el documento `.diagramia.json` sigue siendo el formato de respaldo completo.

El editor exporta SVG autónomo, PNG a 1×/2×/3× y PDF A4 rasterizado del diagrama. También exporta **PDF de presentación**: una página por paso visible de la rama seleccionada, con su cámara, resaltados y texto. El límite es de 100 páginas y 4096 px por página. El PDF conserva el aspecto visual, pero no es editable ni conserva la duración/movimiento entre pasos; usar JSON para volver a editar y la timeline JSON para la estructura temporal. Los trazos libres entran en SVG, PNG y PDF.
