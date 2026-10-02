# Producto y alcance

## Promesa

Diagramia es un canvas AI-native para crear, entender, transformar, revisar y animar diagramas. El humano edita visualmente; la IA opera sobre el mismo documento estructurado. «Dale movimiento a tus ideas» / «Ideas in motion».

Mercado inicial: desarrolladores, arquitectos de software/cloud y docentes técnicos. El primer recorrido debe resolver arquitectura y explicación de sistemas. La visión incluye diagramación libre, procesos y presentaciones; no intentar cubrir toda la superficie de Draw.io/Miro antes de validar el núcleo.

## Diferenciación que debemos demostrar

1. Ediciones confiables y localizadas: «Agregá Redis dentro de Backend debajo de API» afecta sólo esa región.
2. Contexto semántico: zonas, marcadores, selección, IDs y referencias explícitas; no depender de que un modelo «vea» la pantalla.
3. Movimiento nativo: pasos, ramas, estados, recorridos en paralelo y cámara referencian elementos editables.
4. Control visible: preview, diff, ejecución observable, cancelación y undo; sin regenerar todo el documento por cada prompt.
5. Interoperabilidad con agentes: schema público, acciones, MCP y adapters de proveedor.
6. Calidad visual y de interacción; componentes reutilizables que hacen diagramas consistentes.

Son hipótesis de valor. La integración por sí sola es replicable y no garantiza superioridad comercial. La ventaja se construye con fidelidad del engine, estabilidad del contrato, librería, buenos flujos y usuarios satisfechos.

## Recorridos principales

- Crear una arquitectura desde lenguaje natural, ajustar manualmente y exportar.
- Seleccionar una parte, solicitar edición a la IA, revisar cambios y aplicarlos.
- Delimitar una zona Backend, operar sobre esa zona sin alterar las demás.
- Animar una request, navegar la timeline y explicar ramas normales y excepciones.
- Revisar una arquitectura, convertir observaciones en anotaciones y aplicar correcciones elegidas.
- Conectar una IA externa por MCP y obtener el mismo comportamiento del engine.
- Preparar una presentación con frames/cámara y contenido editable.

## Capacidades que debe alcanzar la versión 1

| Área | Alcance de salida |
|---|---|
| Canvas | Nodos, texto, imágenes, iconos, conectores entre nodos, líneas y flechas libres, dibujo a mano alzada, grupos, zonas, marcadores, frames; selección y transformación |
| Layout | Posicionamiento relativo, alineación, distribución y auto-layout con límites de región |
| Documento | JSON/DSL versionada, referencias estables, validación, migraciones y guardado |
| IA | Chat lateral; Create/Edit/Explain/Review/Transform/Animate/Document; adapters y contexto de selección |
| Control | Propuesta, diff, aceptación/rechazo, progreso, cancelación, undo/redo y versiones |
| Animación | Timeline editable, partículas, estados, ramas y paralelismo; presentación con cámara |
| Interoperabilidad | JSON/SVG/PNG/PDF/Markdown; subconjuntos documentados de Mermaid, draw.io, DOT, PlantUML y BPMN/UML |
| MCP | Lectura, selección, contexto, schemas, tools y acciones; permisos y revisión consistentes |
| SaaS | Cuentas, proyectos, permisos, almacenamiento, versiones, uso, cuotas y manejo de errores |
| Recursos generativos | Higgsfield opcional cuando exista acceso autorizado y API/capacidades verificadas |

No prometemos round-trip perfecto en formatos cuyo modelo no representa nuestras animaciones o zonas. Toda conversión debe emitir un reporte de pérdidas.

## IA gratuita

La IA no es gratuita de producir. Free significa un presupuesto financiado y limitado: modelo económico, tamaño de contexto limitado, límites de uso, timeout y corte de gasto. Pro puede ampliar presupuesto y funciones. BYOK y modelos locales son alternativas, no una garantía de compatibilidad universal. Implementar cada adapter con pruebas reales y matriz de capacidades; facturación/precios se definen con datos de uso, no con cifras inventadas.

## Futuro, separado de V1

Colaboración simultánea CRDT, comentarios avanzados, marketplace, plugins comunitarios, análisis de repositorios, generación de código desde diagramas, simulaciones ejecutables y mundos/escenas multimedia. Documentar contratos para no cerrarnos esas puertas; no retrasar el editor y la IA por implementar estas funciones primero.

## Marca y naming

Usar Diagramia como una palabra. Identidad internacional sin destacar «IA» como sigla española. Nombre comercial propuesto; disponibilidad legal, dominios y handles pendiente. No anunciar clientes, métricas ni integraciones todavía inexistentes. Ver `brand/Manual_de_marca_Diagramia.pdf`.
