# Contrato de desarrollo de Diagramia

## Objetivo y prioridades

Construir el producto especificado en `docs/01_PRODUCTO.md`, conservando su identidad visual y el documento semántico compartido. El usuario quiere ejecutar el desarrollo mediante agentes. Actuá como un desarrollador responsable: implementá y verificá; no te limites a escribir planes o placeholders.

Orden de autoridad: instrucciones actuales del usuario → este contrato → especificaciones y ADR → código existente. Si una decisión cambia el alcance, el contrato, el modelo de datos o una dependencia crítica, registrala en `docs/DECISIONS.md`.

## Antes de modificar

1. Leé `DEVELOPMENT_STATE.md` y `BACKLOG.md`.
2. Leé la microfase activa y sus criterios de salida.
3. Revisá los archivos afectados y las pruebas relevantes.
4. Conservá cambios no relacionados. No reinicialices ni regeneres el proyecto.

## Desarrollo continuo

- Avanzá microfase por microfase hasta completar el alcance autorizado. No pidas permiso para decisiones rutinarias, refactors pequeños, pruebas o cambios locales reversibles.
- Elegí la menor solución que cumple el comportamiento pedido, con tipos claros y módulos mantenibles.
- No agregues dependencias por comodidad si el stack actual ya resuelve el problema. Verificá versiones/API/licencias en documentación oficial antes de introducirlas.
- No declares completa una fase por tener una interfaz bonita o mocks. Los criterios deben tener evidencia.
- Si faltan credenciales o acceso externo, completá las partes independientes, el adapter y sus pruebas de contrato; registrá la conexión real como bloqueada. No inventes resultados ni frenes todo el producto.
- Entregá progreso concreto sin preguntas repetitivas. Si no hay un bloqueo material, continuá con la siguiente microfase.
- Subagentes solamente si el usuario o las instrucciones del entorno los autorizan; no son necesarios para ejecutar este plan.

## Invariantes

- El documento canónico vive en `packages/core`; React, MCP y futuro backend lo consumen. No dupliques contratos.
- IDs estables. No los regeneres al importar, renderizar, mover o animar.
- Acciones validadas, cambios atómicos y revisión optimista. Conflictos visibles, sin sobreescritura silenciosa.
- Selection/camera/playback son estado de interfaz, no cambios del contenido.
- Undo/historial de modificaciones y timeline de animación son sistemas diferentes.
- La IA propone acciones; el motor determina y valida sus efectos. No eval, código arbitrario ni HTML ejecutable procedente de modelos.
- La representación visual debe conservar su editabilidad; un video o imagen generada no reemplaza la estructura técnica.
- No agregar claves de proveedores al frontend ni usar prefijos VITE_ para secretos.
- No presentar mocks como integración real. MCP no es un modelo y no ofrece el «100% del potencial» automáticamente.
- Higgsfield requiere capacidad/API autorizada comprobada; no suponer acceso a todas sus funciones ni a una API privada.

## Diseño

Conservá Manrope, Plex, tinta/papel/azul/lima y la identidad en `brand`. Usá la landing como referencia, no copies su layout de marketing al espacio de trabajo. El editor debe priorizar canvas y controles. Animaciones para explicar relaciones y cambios; pausa y reduced-motion; sin hijacking del scroll. Controles accesibles, teclado, contraste y tamaños legibles.

## Calidad

- Pruebas significativas sobre invariantes, pérdida de datos, referencias, revisiones, concurrencia y errores de integración.
- No escribir tests que sólo repliquen la implementación. Reutilizá pruebas existentes.
- Ejecutá los checks afectados; al cerrar una fase, `npm run check`.
- La revisión visual del editor necesita navegador y ejemplos complejos; registrá si el entorno no la permite.
- Al cambiar schemas, actualizá ejemplos, migraciones, docs y `npm run schemas`.
- Al finalizar una sesión, actualizá estado, backlog, decisiones y pruebas ejecutadas. Dejále al siguiente agente un próximo paso inequívoco.

## Publicación y costos

Trabajá localmente salvo autorización de despliegue. No publiques repositorios, no cambies audiencias ni habilites servicios pagos por iniciativa propia. Para la IA incluida en Free, primero implementar presupuesto, rate limit y corte de gasto; los tokens y renders cuestan dinero aunque el usuario final no pague.

## Reporte de cierre

Qué cambió; cómo comprobarlo; pruebas ejecutadas y resultado; límites reales; microfase completada; siguiente tarea. Nunca «100% terminado» con pasos bloqueados o esenciales pendientes.
