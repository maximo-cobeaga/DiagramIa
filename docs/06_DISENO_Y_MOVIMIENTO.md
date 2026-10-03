# Diseño de producto y movimiento

Manual completo en brand. La landing incluida sirve de referencia para una identidad original, limpia y técnica. No sustituir por una plantilla genérica de tarjetas, degradados decorativos y slogans sin prueba.

## Espacio de trabajo

Canvas al centro; herramientas y navegación de documento a la izquierda; inspector/IA a la derecha; timeline inferior plegable. El producto debe abrir en una actividad útil. El editor inicial ocupa ese esquema; densidad, paneles y comportamiento responsive siguen siendo trabajo de P1.

Jerarquía: documento → contenido/selección → acciones relevantes → propiedades secundarias. Herramientas con nombres concretos: Nodo, Conector, Zona, Marcador, Frame, Animación. El usuario debe entender qué cambió, dónde y cómo deshacerlo. Mensajes de validación cerca del control afectado y resumen accesible.

## Sistema visual

Tinta #141619, papel #F4F6F8, azul #245CF6, lima #D4F246. Manrope para texto; IBM Plex Mono para código/metadatos. No cambiar logo ni destacar IA en el nombre. Texto normal 16px como objetivo; controles principales 14px; metadata compacta excepcional 12px. Revisar escalado 200%, navegación por teclado, foco, contraste, lector de pantalla y móvil.

## Movimiento

- Respuestas UI 160–240ms.
- Escenas narrativas 500–900ms.
- Paso explicativo inicial 1.5–2.5s; configurable.
- Curva base cubic-bezier(.22,1,.36,1).
- Animación ligada a significado, con pausa, reinicio y scrubber.
- reduced-motion elimina movimiento automático decorativo; la reproducción explícitamente solicitada sigue accesible.
- Scroll nativo. No secuestrar rueda, no impedir retroceder, no esconder contenido por falta de JS.

La cámara narrativa se edita en «Ajustes del paso»: enfoque y transición. «Seguir con la cámara» controla el canvas del editor; Presentar usa su cámara independiente. El viaje interpola el centro de la vista y se aleja entre elementos lejanos antes de acercarse al destino. Pausa y movimiento manual cancelan el viaje pendiente; una pestaña nueva no hereda ese movimiento. Con reduced-motion se conserva el encuadre y se elimina la transición.

## Escenarios de referencia

Compra confirmada: inventario → pasarela → autorización → pedido → fan-out de email/envío/auditoría. Rechazo: pendiente → aviso → otro medio → retry a pasarela → recuperación. Rama alternativa de expiración/cancelación/liberación de stock.

La diferencia debe estar en topología y estados, no sólo color. Labels y caption explican incluso sin distinguir tonos. Separar la lógica semántica de animación, las partículas visuales y la narrativa de marketing.

## Prueba visual de fase

Desktop 1440×900 y 1920×1080; tablet 1024×768; móvil 390×844. Abrir los tres fixtures, mover, seleccionar, editar, reproducir, cambiar escenario, importar/exportar y revisar errores. En diagramas grandes usar pan/zoom/fit; no hacer etiquetas ilegibles para meter todo en una pantalla. Capturar evidencia si se dispone de browser; si no, registrar la limitación sin inventar screenshots.
