# Operación local (P4.5 implementada)

Requisitos: Node 24, npm y Docker Compose. PostgreSQL usa la imagen oficial `postgres:17.11-alpine`; [tags oficiales](https://hub.docker.com/_/postgres/tags) y [licencia PostgreSQL](https://www.postgresql.org/about/licence/). La base escucha sólo en `127.0.0.1:5433` y conserva datos en un volumen Docker.

```sh
npm ci
npm run db:up
npm run api
npm run dev
```

`npm run api` y `npm run dev` van en terminales separadas. El gateway responde `/health` (proceso vivo) y `/ready` (inicialización local completa); el PostgreSQL de Compose tiene su propio healthcheck. Los logs HTTP del gateway contienen método, ruta, estado y duración, sin texto del pedido ni secretos. Ver estado de la base: `docker compose -f infra/compose.dev.yml ps`. Detenerla sin borrar datos: `npm run db:down`.

El valor por defecto `DIAGRAMIA_DB_PASSWORD=diagramia-local-only` es sólo para desarrollo. Para cambiarlo, fijá la variable en el entorno antes de levantar Compose. En un volumen ya inicializado, cambiar la variable no rota la contraseña existente. `DIAGRAMIA_DB_PORT` cambia el puerto local (5433 por defecto).

`npm run db:backup` crea un `pg_dump` custom en `state/backups/`, ignorado por Git. El archivo sólo se publica si `pg_dump` termina bien y el encabezado es válido. `npm run smoke:db` verifica una restauración básica. `npm run smoke:repository` crea dos proyectos Docker efímeros, ejecuta la migración, prueba CAS concurrente, versiones, rollback, recibos y rutas HTTP; restaura el dump en el segundo y comprueba documentos y auditoría. Ambos smokes eliminan sólo sus proyectos de prueba. No modifican la base de desarrollo. El CI ejecuta ambos sin secretos.

Para habilitar documentos en el gateway local, fijá `DIAGRAMIA_DATABASE_URL=postgres://diagramia:diagramia-local-only@127.0.0.1:5433/diagramia` y un `DIAGRAMIA_DOCUMENTS_TOKEN` largo en `.env`, después ejecutá `npm run db:up` y `npm run api`. El gateway aplica la migración antes de escuchar; `/ready` devuelve 503 si la base deja de responder. Las rutas `POST /v1/documents`, `GET /v1/documents/:id`, `POST /v1/documents/:id/batches`, `GET /v1/documents/:id/versions`, `GET /v1/documents/:id/versions/:revision`, `POST /v1/documents/:id/restore` y `GET /v1/documents/:id/audit` requieren `Authorization: Bearer <DIAGRAMIA_DOCUMENTS_TOKEN>` y `x-diagramia-client: editor`. El token queda sólo en procesos de servidor; no incluirlo en el frontend ni en un build.

Todavía no hay cuentas, permisos por proyecto ni sincronización del editor o MCP con estas rutas (P4.1/P5.1). La configuración es local y no debe usarse como despliegue multiusuario. El job de CI quedó preparado, pero este árbol no tiene `.git` y no se ejecutó en GitHub.
