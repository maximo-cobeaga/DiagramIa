# Definición de terminado

No confundir starter compilado, MVP local y producto V1. P0–P8 tienen criterios concretos. Una función mockeada no aprueba su integración real.

## Recorridos de producto

| ID | Dado / acción | Resultado exigido |
|---|---|---|
| A01 | Documento vacío; crear arquitectura desde chat | Nodos/edges/zonas válidos y editables; IDs estables; salida real del provider |
| A02 | API seleccionada; agregar Redis debajo dentro de Backend | Sólo región relevante cambia; layout no colisiona; diff y undo completo |
| A03 | Dos zonas Backend con igual label | Desambiguación explícita antes de modificación |
| A04 | Usuario edita mientras IA genera | Conflicto visible o rebase autorizado; ningún cambio manual perdido |
| A05 | Cancelar o rechazar una propuesta | Documento canónico igual al anterior; staging descartado |
| A06 | Reintentar el mismo apply tras timeout | Un solo cambio/recibo; no duplicados ni segundo cobro interno |
| A07 | Arrastrar, agrupar, copiar/pegar y cambiar frame | Geometría/referencias consistentes; historia reversible |
| A08 | Crear animación y modificar duración/orden | Timeline editable persiste; seeking exacto; no muta posiciones canónicas |
| A09 | Flujos de compra normal/rechazo | Ramas, paralelismo y loop reales del modelo; color no es la única diferencia |
| A10 | Entrar/salir de presentación y usar reduced-motion | Controles/teclado accesibles; documento intacto |
| A11 | Export JSON y reimport | Contenido, IDs, zonas y animaciones conservados; migrations explícitas |
| A12 | Import/export externo | Subset soportado con reporte de pérdidas; error no destruye documento |
| A13 | Dos usuarios/proyectos distintos | Sin lectura/escritura cruzada; validación server-side en cada ruta/tool |
| A14 | MCP externo modifica documento abierto | UI/MCP ven mismo receipt/revision y contenido; reconnect no duplica |
| A15 | Se agota cuota gratuita | No se llama al provider; explicación/alternativa y ledger coherente |
| A16 | Usuario anónimo crea un diagrama, se registra al pedir IA y acepta una propuesta | Embudo completo reconstruible desde eventos, sesión anónima vinculada a la cuenta, costo del pedido en USD; ningún evento contiene el texto del diagrama |
| A17 | Guardado falla o storage queda sin espacio | Aviso y recuperación/export; ninguna falsa confirmación de guardado |
| A18 | Restaurar backup/version y rollback release | Datos y versión reproducibles; restauración comprobada |

## Capas de evidencia

1. Core/types/build: checks automáticos.
2. Editor: recorrido visual/interacción en desktop y móvil.
3. Integraciones: contract test + smoke real cuando hay acceso.
4. Operación: permissions/quota/backup/restore/deploy documentados.

## Cierre honesto

Una microfase puede estar implementada con prueba real bloqueada por credenciales, pero no marcarse verificada. Anotar el bloqueo preciso y avanzar trabajo independiente. La V1 sólo se cierra cuando los criterios esenciales se comprueban y los riesgos restantes se aceptan explícitamente.
