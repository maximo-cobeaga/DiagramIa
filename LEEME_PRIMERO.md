# Diagramia — Paquete de desarrollo con IA

Abrí esta carpeta como proyecto en Codex, Claude Code o tu editor con agentes. El objetivo es desarrollar Diagramia por fases, sin perder la visión del producto ni reconstruir contexto en cada sesión.

## Arranque en Windows, macOS o Linux

Instalá Node.js 24 LTS y Git. La base declara Node >=22.12; se verificó con Node 24.19. No hace falta Docker para probar el editor y el MCP local. Para las fases SaaS sí se incorporará PostgreSQL y un backend.

Desde una terminal en la carpeta descomprimida (en Windows también podés usar `scripts/start-windows.ps1`; si la política del equipo no permite scripts, usá los comandos manuales):

```bash
npm ci
npm run check
npm run dev
```

Abrí la dirección que muestre Vite, normalmente `http://localhost:5173`.

Para ver la landing, en otra terminal:

```bash
npm run dev:landing
```

Abrí `http://localhost:4173`. La landing incluida es la versión con 12/15 nodos y nuevas animaciones con scroll. Es una referencia de marca y una página independiente del editor.

## Empezar a desarrollar con un agente

1. Abrí TODA esta carpeta, no solamente `apps/editor`.
2. Pegá el contenido de `prompts/01_INICIO.md` en el agente.
3. Permitile leer el repositorio, ejecutar comandos locales y modificar archivos del proyecto.
4. Pedile que avance por `docs/03_PLAN_DE_DESARROLLO.md`, manteniendo `DEVELOPMENT_STATE.md` y `BACKLOG.md`.
5. Cuando cambiás de chat/modelo, usá `prompts/02_CONTINUAR.md`. El estado escrito evita empezar otra vez.

No necesitás pegar todos los documentos en cada mensaje: el agente debe leer los archivos referenciados. `AGENTS.md` es el contrato de trabajo. `CLAUDE.md` remite al mismo contrato.

## Qué ya funciona

- Editor React/TypeScript con SVG editable, selección múltiple, arrastre, creación/eliminación de nodos, conexiones y zonas.
- Cambiar nombre de un nodo; mover con flechas al enfocarlo; zoom básico.
- Documentos JSON versionados, validación y persistencia local en el navegador.
- Importar/exportar JSON y exportar SVG.
- Undo/redo de hasta 100 cambios durante la sesión.
- Timeline reproducible, pausa, reinicio y avance manual; partículas en conexiones, estados y flujos en paralelo.
- Tres ejemplos: arquitectura SaaS, compra confirmada y rechazo con recuperación.
- Propuestas JSON, diff y aplicación atómica de acciones con control de revisión.
- MCP local sobre UN archivo, con lectura, esquema, preview y aplicación de acciones.
- Landing actualizada y kit de marca completo.

## Qué NO está terminado

No hay chatbot conectado a modelos, backend SaaS, cuentas, colaboración, cobros, cuotas gratuitas, biblioteca profesional, layout completo, edición visual de timeline ni integración activa con Higgsfield. El MCP local modifica un archivo: **todavía no sincroniza en vivo con el documento abierto en el navegador**. Para ver sus cambios, importá el archivo actualizado. El editor guarda en localStorage; ese estado tampoco se conecta al archivo automáticamente.

El código es una base real y probada, no el producto final. No alcanza con levantar la landing para declarar que Diagramia está terminado. La definición de producto terminado está en `docs/04_CRITERIOS_DE_ACEPTACION.md`.

## MCP local

```bash
npm run build
node scripts/setup-mcp.mjs
```

Esto crea `state/working.diagramia.json` sin sobrescribirlo si ya existe y genera configuraciones con rutas absolutas para tu equipo. Consultá `integrations/README.md`. No incluye claves ni cuentas ajenas.

## Orden de lectura

`AGENTS.md` → `DEVELOPMENT_STATE.md` → `docs/01_PRODUCTO.md` → `docs/02_ARQUITECTURA.md` → `docs/03_PLAN_DE_DESARROLLO.md` → contratos en `schemas/` y ejemplos.

Las decisiones rutinarias ya tienen un punto de partida. Ningún prompt puede garantizar por sí solo calidad, velocidad o autonomía ilimitada: el ciclo que importa es implementar, probar, revisar y registrar el siguiente paso.
