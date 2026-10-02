# Calidad, datos y operación

## Checks del starter

`npm run check`: core/editor/MCP compilan; tests de referencias, atomicidad, IDs, zonas, revisión, idempotencia, preview, seeking, paralelismo y un host MCP real. `npm run schemas` genera el contrato para agentes. Los resultados concretos están en VALIDATION.md.

## Riesgos a resolver al crecer

- localStorage no es backup ni base multiusuario. Guardado con indicador, fallos visibles, recuperación e import/export.
- La UI actual no tiene pan/cámara completos ni routing con obstáculos. Describir el soporte real.
- El ledger del starter retiene sólo 100 lotes; no vender idempotencia durable ilimitada.
- Undo de sesión no reemplaza versiones persistidas.
- Deletions podan referencias, pero las captions podrían necesitar revisión para conservar sentido.
- Campos reservados no significan renderers implementados (por ejemplo image/custom).
- No hay sincronización vivo entre editor y MCP local. Evitar divergencia en P5.

## Pruebas por capas

Core: invariantes/property tests y fixtures de migración. Editor: recorridos end-to-end significativos (crear, seleccionar, mover, proponer, rechazar, aplicar, undo, export/reimport). Backend: permisos por tenant, CAS, retries, cuotas, documentos privados y fallos de DB. MCP: discovery, schema, tool errors, concurrencia, reconnect y scopes. Providers: tests de contrato con mocks marcados y una smoke real con credenciales autorizadas.

## Seguridad de producto

No inyectar HTML de modelos ni confiar en un SVG cargado. Render texto escapado. Assets con límites y formatos permitidos; sanitización y aislamiento. No aceptar URLs arbitrarias de servidor sin protección SSRF. Permisos DB antes de consultar o modificar; no confiar en documentId del cliente. Rate limit, límites de payload, logs sin claves, sesiones/cookies seguras y backups antes de producción.

El starter valida contenido, pero no es un SaaS listo para internet. stdio local no necesita exponer puerto público. El servidor estático de landing es sólo desarrollo, no un servidor de producción.

## Uso y costos

Registrar requestId, project/user, adapter/model, presupuesto reservado, consumo real y estado. Cancelación no garantiza que el proveedor no haya cobrado. Balance reconciliado y corte global para Free; retries deduplicados. No guardar claves BYOK sin cifrado/separación y política de eliminación.

## Operación V1

Docker reproducible, env example sin secretos, migraciones, health/readiness, logs y métricas, rollback, backup y restauración probada. CI de lint/types/tests/build, análisis de dependencias y revisión de licencias. Plan inicial puede ser un solo servicio con workers; no crear microservicios por estética.

## Evidencia de salida

Check automático + prueba visual + prueba de proveedor/host cuando sea integración real. Registrar lo que no se pudo ejecutar. Una demo local, un mock o un screenshot no demuestran permisos, persistencia ni integración de producción.
