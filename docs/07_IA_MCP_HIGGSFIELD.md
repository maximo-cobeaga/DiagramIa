# Integraciones y experiencia de IA

## Providers de inferencia

Contrato previsto: `capabilities()`, `generateActions(request)`, `explain(request)`, `cancel(requestId)`. request incluye modelo, conversación, documentId/revision, selección/región, presupuesto y schema. Respuesta incluye acciones/texto, finish reason, usage, duración y requestId del proveedor cuando exista.

Implementar primero un proveedor con structured output comprobado y un adapter local compatible. Luego otros proveedores sobre el mismo contrato. No cambiar el documento para cada provider. Usar feature detection; si no soporta structured output, parsear/validar con reparación acotada y error visible, nunca confiar en JSON textual sin validarlo.

La salida del modelo no puede ejecutar shell, fetch arbitrario, SQL, JSX o scripts embebidos. «Convertir a código» genera un artefacto revisable; no lo ejecuta automáticamente.

## Chat y control

Modos Create/Edit/Explain/Review/Transform/Animate/Document. Create/Edit/Transform/Animate generan lotes. Explain/Document generan texto/artefactos. Review genera anotaciones con severidad, evidencia y corrección opcional. Observación no es certeza de una vulnerabilidad ni sustituto de auditoría.

Siempre incluir selección y región para edición contextual. Si «Backend» corresponde a varias zonas, mostrar opciones/solicitar aclaración; no adivinar silenciosamente. Una solicitud de «ordenar selección» no autoriza mover todo el documento.

Flujo de interfaz: interpretando → propuesta → preview → aplicar → receipt. Cancelación descarta staging. Desconexión y retry usan el mismo transactionId. Chatbot lateral de producto es distinto del agente que está desarrollando el repositorio.

## MCP actual

SDK oficial @modelcontextprotocol/server 2.2.0. Cuatro tools: read_canvas, get_schema, validate_actions, apply_actions. stdio, un archivo configurado y sin rutas arbitrarias en inputs. No expone todos los discos del usuario. La conexión con un host real se prueba por Client + StdioClientTransport.

El host controla permisos de tools. Apply escribe el documento y puede borrar contenido. Preview no escribe. Config local generado en integrations. No hay remote URL, OAuth ni sincronización navegador/archivo todavía.

## MCP del producto

P5: transporte autenticado y bus al documento abierto. Exponer read selection/region, schema/capabilities, validate/preview/apply, inspect, animate y export; versionar nombres/capacidades. Permisos del usuario/proyecto en cada llamada y revisión optimista. Pasar contexto compacto con paginación para documentos grandes. Testear con al menos dos hosts externos, distintos permisos y reconexiones.

Servidor remoto: Streamable HTTP y OAuth según spec vigente; validar audience/resource, scopes y sesión. No asumir que una cuenta autenticada en un host está autorizada en otro tenant. Secrets separados de documentos.

## Higgsfield

Objetivo: generar recursos visuales para escenas, fondos, presentaciones o contenido multimedia avanzado. Complementa el documento semántico; no produce una imagen raster que suplante flechas, labels y nodos editables.

Antes de implementar, comprobar API pública/comercial, permisos, modelos, precios, límites, licencias y callbacks oficiales. Si no hay acceso viable, preservar el adapter y permitir importar assets manualmente. No inventar endpoints ni automatizar una interfaz privada para convertirla en integración comercial.

Job: brief/referencias → estimación y autorización de costo → creación idempotente → progreso/cancelación → resultado → asset persistido con provenance → uso en canvas. Renders pagos no se disparan por scroll, apertura o retries automáticos sin deduplicación. Assets se sirven como datos, con validación de formato/tamaño y tratamiento seguro de SVG. Callbacks firmados, timeout, backoff y facturación de uso cuando corresponda.

No incluir credenciales en el ZIP. El backend futuro será el único intermediario autorizado con proveedores.
