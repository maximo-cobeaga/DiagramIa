# Uso observado de DeepSeek

## Muestra comunicada por el usuario · 03/10/2026

Fuente: totales del panel de DeepSeek transcritos por el usuario. No se consultó la cuenta del proveedor ni se verificó una factura. El período y el reparto entre entrada, salida y caché no fueron informados.

| Medida | Valor observado |
|---|---:|
| Costo mostrado | USD 0,05 |
| Solicitudes API | 24 |
| Tokens totales | 404.998 |
| Promedio de costo por solicitud | USD 0,002083 ≈ USD 0,0021 |
| Promedio de tokens por solicitud | 16.874,9 |

Los promedios son divisiones de esta muestra. El costo mostrado puede estar redondeado. No son una tarifa publicada, un precio del producto ni una predicción del costo de otro pedido. No se configura el adapter ni se reescriben recibos del gateway a partir de este total: falta el reparto entre entrada, salida y caché para estimar cada llamada con una tarifa verificable. El proveedor sigue siendo la fuente del cobro real.

Una aclaración del modelo también puede consumir tokens y créditos; responderla es una solicitud nueva. Se conserva la ventana de conversación acotada y los límites del gateway. La desambiguación local entre zonas homónimas sigue evitando una llamada al modelo cuando el código ya puede pedir la elección.

## Corridas reales del 04/10/2026 · ejemplos cotidianos

Fuente: consumo informado por la API en cada respuesta, guardado por `scripts/everyday-ai-smoke.mjs` en `state/everyday-ai*` (archivos ignorados por Git). Modelo `deepseek-flash` por el adapter compatible. No se consultó el panel ni una factura; sin tarifa cargada, el costo en USD es desconocido.

| Corrida | Llamadas | Entrada | Salida | Resultado |
|---|---:|---:|---:|---|
| Prompt completo | 2 | 15.254 (una medida) | 143 (una medida) | Pregunta correcta; la respuesta del viaje se truncó y su consumo se informó como cero |
| Prompt compacto, primera | 3 | 7.857 | 4.716 | Pregunta correcta; viaje rechazado tras una reparación por IDs repetidos |
| Prompt compacto, final | 4 | 8.537 | 11.961 | Pregunta, viaje (19 piezas), mudanza (13) e idea (12) aceptados sin reparaciones |

Total medido: 31.648 tokens de entrada y 16.820 de salida en ocho llamadas; una novena llamada (la truncada) quedó sin medir. Ese hueco motivó contabilizar el consumo de las respuestas fallidas (ADR 085). Con el prompt compacto, una llamada de Crear sin reparación usó entre 1.930 y 2.322 tokens de entrada, contra 15.254 del prompt completo.

Es una muestra de cuatro pedidos, no una tasa de fiabilidad ni un costo por pedido del producto. La regresión de navegador usa los tres resultados guardados en `examples/everyday-*.diagramia.json` y no vuelve a llamar al modelo.
