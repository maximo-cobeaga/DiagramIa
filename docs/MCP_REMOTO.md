# MCP remoto (P5.2)

El gateway ofrece `POST /mcp` mediante Streamable HTTP. El cliente presenta un access token OAuth para el recurso exacto configurado en `DIAGRAMIA_MCP_RESOURCE_URL`. El servidor publica los metadatos de recurso protegido en `/.well-known/oauth-protected-resource/mcp`, valida firma RS256 por JWKS, issuer, audience y vencimiento, y asocia el `sub` a una cuenta ya creada por el login OIDC. Cada llamada queda limitada al proyecto de esa cuenta. `diagramia:read` es obligatorio para conectarse y usar las herramientas de lectura; `diagramia:write` es adicional para `apply_actions`. Un miembro `viewer` no puede escribir aunque su token declare ese scope.

## Configuración

1. Configurar PostgreSQL, `DIAGRAMIA_DOCUMENTS_TOKEN` y las cinco variables `DIAGRAMIA_OIDC_*` de `.env.example`. El usuario debe iniciar sesión en Diagramia al menos una vez para que exista su cuenta/proyecto.
2. Registrar en el proveedor OAuth una API cuyo identificador/audience sea **idéntico** a la URL pública de MCP, por ejemplo `https://diagramia.example/mcp`. Habilitar access tokens JWT firmados con RS256 y los scopes `diagramia:read` y `diagramia:write`. El issuer debe coincidir exactamente con `DIAGRAMIA_OIDC_ISSUER` y publicar claves JWKS.
3. Definir `DIAGRAMIA_MCP_RESOURCE_URL=https://diagramia.example/mcp` y `DIAGRAMIA_MCP_JWKS_URL=https://DOMINIO_DEL_ISSUER/.well-known/jwks.json`, ajustando la ruta JWKS real del proveedor. Ambos valores son sólo de servidor. En desarrollo se permite HTTP exclusivamente en loopback.
4. Exponer el gateway detrás de HTTPS conservando el encabezado `Host` público. Si el proxy altera la ruta, usar una regla que preserve `/mcp` y `/.well-known/oauth-protected-resource/mcp`. Probar que `GET` al segundo endpoint devuelve `resource` y `authorization_servers` correctos.
5. Configurar un host MCP que soporte Streamable HTTP y OAuth para conectar a la URL del recurso. El host debe pedir el access token con `resource` igual a esa URL y scopes de lectura/escritura según la acción. Un token para el frontend o para otra API no sirve como token MCP. En llamadas remotas `documentId` es obligatorio y es el ID semántico del documento dentro del proyecto del usuario.

La sesión web de Diagramia no autentica MCP. MCP usa el token del usuario emitido por el proveedor OAuth, sin exponer `DIAGRAMIA_DOCUMENTS_TOKEN` al host. El modo MCP stdio de archivo o de token de servidor permanece disponible para trabajo local.

## Verificación

`npm run smoke:mcp-remote` levanta PostgreSQL e issuer/JWKS efímeros, usa el cliente oficial MCP y verifica metadatos, desafío 401, rechazo de Host/Origin, firma, expiración, audience, cuenta desconocida, scopes, rol viewer, lectura/escritura y aislamiento de dos proyectos con el mismo ID de documento. `npm run check` sigue probando el modo stdio. El smoke elimina sus volúmenes temporales.

**Prueba externa pendiente:** no hay tenant Auth0 ni dos hosts remotos configurados aquí. Deben comprobarse el flujo completo de autorización del host, emisión del access token para el audience exacto, reconexión y operación detrás del proxy real antes de considerar listo el despliegue. El soporte del parámetro OAuth `resource` depende del proveedor/host concretos y debe verificarse allí. Ver P5.3 para pruebas en dos hosts.
