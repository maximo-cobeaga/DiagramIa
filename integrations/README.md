# Conectar el MCP local a tu IA

Esto es una herramienta del producto Diagramia, distinta de las instrucciones para desarrollar el repositorio. El servidor local puede editar el archivo configurado, pero el editor del navegador todavía no observa ese archivo.

## Preparación

En la raíz:

```bash
npm ci
npm run build
node scripts/setup-mcp.mjs
```

El generador usa la ruta de Node instalada y las rutas absolutas de TU carpeta, con escaping correcto para Windows. Produce:

- `integrations/claude.mcp.generated.json`: estructura mcpServers para hosts compatibles.
- `integrations/codex.mcp.generated.toml`: bloque mcp_servers para Codex CLI.
- `state/working.diagramia.json`: copia inicial, sin sobrescribir si ya existe.

Copiá solamente el bloque diagramia en la configuración de tu host. No sobrescribas otros servidores ni pegues rutas de otro equipo. Consultá la documentación de tu versión de host para el archivo/comando de instalación correcto; no asumas que todos los hosts aceptan stdio o el mismo JSON. Un cliente web necesita transporte remoto, pendiente en P5.

## Prueba inicial

Pedile al host:

> Usá read_canvas. Obtené el schema. Prepará un lote para agregar Redis dentro de Backend debajo de API. Ejecutá validate_actions y mostrame el diff. Si autorizo la edición, ejecutá apply_actions con ese mismo lote y revision.

Para leer cambios en el editor, importá `state/working.diagramia.json`. Para usar otro documento, exportalo desde el editor a un archivo .diagramia.json y configurá su ruta absoluta. El servidor no acepta rutas en tool inputs.

## Tools

read_canvas, get_schema y validate_actions no escriben. apply_actions escribe y puede eliminar contenido. Conservá la revisión y usá un ID de lote único; un retry idéntico conserva ID/contenido. No solicites auto-approve general para todos los tools.

## Fallos

- Documento inexistente/ruta relativa: ejecutá el generador y revisá las rutas.
- Dist inexistente: `npm run build`.
- REVISION_CONFLICT: read_canvas otra vez y rehacé la propuesta sobre la revisión actual.
- Lock persistente tras cierre abrupto: comprobá que no haya otro proceso; retiralo sólo después.
- Cambios que no aparecen en navegador: importá el archivo; no hay sync vivo todavía.
- Contrato cambiado: recompilá core/MCP y regenerá schemas.

No subir los archivos generated a Git: contienen rutas locales. No contienen tokens, pero dependen del equipo.
