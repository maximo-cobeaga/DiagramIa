# Diagramia

Canvas semántico para crear, editar, entender y animar ideas mediante IA. Humanos y agentes operan sobre el mismo documento estructurado.

Empezá por [LEEME_PRIMERO.md](LEEME_PRIMERO.md).

## Workspace

| Ruta | Responsabilidad |
|---|---|
| `apps/editor` | Editor React/Vite: canvas, inspector, timeline, presentación, biblioteca y chat de IA |
| `apps/api` | Gateway de IA, OIDC opcional, documentos PostgreSQL y MCP remoto OAuth; loopback en desarrollo |
| `apps/mcp` | Servidor MCP stdio o herramientas montadas en el gateway remoto |
| `apps/landing` | Landing vigente; referencia visual y comercial |
| `packages/core` | Contratos, acciones, validación, migraciones, routing, layout, contexto y biblioteca |
| `packages/interop` | Mermaid, draw.io, DOT, PlantUML, BPMN y Markdown, con reporte de pérdidas |
| `packages/providers` | Adapters de modelos: Claude, compatible OpenAI/Ollama y demostración |
| `examples` | Documentos y lote de acciones de referencia |
| `schemas` | JSON Schema generados desde Zod |
| `brand` | Manual PDF, SVG, paleta, tipografías y licencias |
| `docs` | Producto, arquitectura, fases y contratos |
| `prompts` | Inicio, continuidad, microfases, revisión y cierre |
| `integrations` | Guías y configuraciones locales MCP |
| `scripts` | Utilidades de arranque y generación |

## Comandos

| Comando | Resultado |
|---|---|
| `npm ci` | Dependencias exactas del lockfile; compila core, interop y providers al finalizar |
| `npm run dev` | Editor de desarrollo en http://127.0.0.1:5173 |
| `npm run api` | Gateway de IA en http://127.0.0.1:8787 (lee `.env`; ver `.env.example`) |
| `npm run smoke:ai` | Prueba REAL de la IA contra el proveedor configurado (consume tokens); `-- anthropic` o `-- local` para elegir |
| `npm run smoke` | Recorrido del editor en Chrome/Edge headless; necesita `npm run dev` corriendo. Borra el documento local de esa URL: usá otra instancia si estás trabajando |
| `npm run dev:landing` | Landing estática local |
| `npm run build` | Paquetes, editor, MCP y gateway compilados |
| `npm test` | Pruebas del engine, interop, gateway/adapters y un host MCP real por stdio |
| `npm run check` | Build y pruebas |
| `npm run schemas` | Regenera los contratos publicados |
| `npm run db:up` / `npm run db:down` | PostgreSQL local con Docker Compose; conserva el volumen al detener |
| `npm run db:backup` / `npm run smoke:db` | Backup local y prueba de restauración en dos instancias aisladas; ver `infra/README.md` |
| `npm run smoke:repository` / `npm run smoke:shared` | Integración PostgreSQL, cuentas, cuotas y editor↔MCP con navegador real |
| `npm run smoke:mcp-remote` | MCP Streamable HTTP con OAuth, issuer/JWKS y PostgreSQL efímeros |
| `node scripts/setup-mcp.mjs` | Archivo de trabajo y configs MCP locales |
| `npm run mcp` | MCP; usa DIAGRAMIA_DOCUMENT para archivo local o DIAGRAMIA_DOCUMENTS_URL/ID/TOKEN para el canal compartido |

El editor y el gateway consumen los paquetes compilados. Después de modificar `packages/*`, ejecutá `npm run build -w @diagramia/<paquete>` y reiniciá el servidor de desarrollo si hace falta. No hay watchers de paquetes todavía.

La IA del editor funciona con el gateway y un proveedor configurado en `.env`. Con OIDC activado también exige sesión y cuota de créditos. El guardado compartido y la cuenta se configuran como se indica en [docs/CUENTA_Y_COMPARTIDO.md](docs/CUENTA_Y_COMPARTIDO.md); MCP remoto en [docs/MCP_REMOTO.md](docs/MCP_REMOTO.md). Sin proveedor de IA, sigue disponible el canal manual (copiar contexto y pegar un lote).

No subir `.env`, archivos personales de `state`, node_modules ni configuraciones MCP generadas con rutas locales. Incluí `package-lock.json` en Git. El código de aplicación no incluye una licencia de publicación abierta; decidila antes de publicar el repositorio. Las licencias de fuentes están en `brand/fonts`.
