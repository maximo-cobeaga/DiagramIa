# Diseño de producto y movimiento

## Piezas, organización y conexiones (ADR 077–079)

Figuras, texto y dibujos se seleccionan y se mueven juntos. Un grupo se selecciona completo por clic, teclado o rectángulo; Alt permite elegir un miembro. Copiar/Duplicar/Agrupar/Desagrupar quedan junto a la selección; Pegar aparece en la barra del lienzo cuando hay algo copiado. Los grupos incluyen trazos, se guardan y conservan sus distancias internas al mover o alinear. Las copias preservan imágenes, enlaces internos y grupos; sólo las copias reciben IDs nuevos. No duplican el recorrido de animación ni el historial.

Al mover, guías de bordes y centros ajustan suavemente a 6 px de distancia visible. Alt mueve libremente; la preferencia de grilla puede apagar las ayudas. «Acomodar» despliega alineación y separación uniforme cerca de la selección, con grupos tratados como piezas completas. Las guías no guardan contenido; cada operación confirmada se deshace en un paso.

Cuatro puntos + alrededor de una figura seleccionada permiten arrastrar una conexión o elegir origen y destino con dos clics/toques. Enter/Espacio sobre un punto y luego sobre el destino hacen lo mismo con teclado. La flecha previa destaca el destino y muestra su nombre; sólo al confirmar se crea la conexión. Esc cancela también durante un arrastre. Puntos, ajuste y destino previo son UI, sin claves ni dependencia nueva.

Manual completo en brand. La landing incluida sirve de referencia para una identidad original, limpia y técnica. No sustituir por una plantilla genérica de tarjetas, degradados decorativos y slogans sin prueba.

## Espacio de trabajo

Canvas al centro; herramientas y navegación de documento a la izquierda; inspector/IA a la derecha; timeline inferior plegable. El producto debe abrir en una actividad útil. El editor inicial ocupa ese esquema; densidad, paneles y comportamiento responsive siguen siendo trabajo de P1.

Jerarquía: documento → contenido/selección → acciones relevantes → propiedades secundarias. Herramientas con nombres concretos: Nodo, Conector, Zona, Marcador, Frame, Animación. El usuario debe entender qué cambió, dónde y cómo deshacerlo. Mensajes de validación cerca del control afectado y resumen accesible.

## Empezar y editar con pocos pasos (ADR 070–072)

Un espacio nuevo abre «¿Qué querés crear hoy?» dentro del canvas, con tres entradas: Contame tu idea, Dibujar y Elegir un ejemplo. No aparece un tutorial obligatorio; ? lo abre cuando se necesita. Contame tu idea enfoca el asistente o el acceso, sin enviar mensajes. Dibujar invita a tocar el lienzo y escribir una nota. Los ejemplos muestran el diagrama real: explicar una idea, planificar una tarea y San Pancho; los técnicos se encuentran en una sección adicional. Abrirlos crea otra pestaña y conserva el trabajo anterior. La bienvenida desaparece al crear contenido; lo guardado se recupera normalmente.

Seleccionar muestra las acciones junto al elemento: Escribir, Color, Duplicar, Unir y Más. Unir pide elegir otro elemento; también funciona con foco y Enter/Espacio. Esc cancela. Flechas izquierda/derecha, Home y End recorren la barra. Cambiar color, texto, duplicar y conectar pasan por las acciones del documento y se deshacen. La barra se mantiene dentro del lienzo y se oculta durante arrastre, edición, reproducción y propuestas pendientes.

Concentrarme (Shift+F) da todo el ancho al canvas, mantiene el reproductor pequeño y oculta los paneles. Volver al editor o Esc restaura sus preferencias sin editar ni reencuadrar el documento. En móvil se conserva el scroll nativo; bienvenida y ejemplos pueden desplazarse dentro del canvas. Continúa pendiente la observación de niños y adultos mayores, lectores de pantalla y dispositivos físicos.

## Dibujo fiel, lápiz y colores (ADR 073–075)

Mientras se ubica una forma se ve esa misma plantilla; al escribir, el campo transparente ocupa el título real. Seleccionar agrega un contorno externo, sin pintar de azul el objeto. El color de dibujos y conexiones debe verse también con la selección activa.

Lápiz (D) permite puntos, círculos cerrados y varios trazos seguidos. Color y grosor se eligen antes de dibujar; preview y resultado usan el mismo render. El color inicial es blanco por pedido del usuario. Guiado (G, ADR 076) reduce el temblor con suavizado por distancia y emprolija líneas, círculos/óvalos y rectángulos reconocibles al soltar, sin una espera obligatoria. Mantener durante 450 ms ofrece una vista previa con el nombre de la forma; movimientos de hasta 4 px no reinician la espera ni deshacen esa vista previa. Seguir dibujando recupera el trazo suavizado y al soltar se evalúa el gesto completo. Las formas dudosas conservan ese trazo; el lápiz libre no interpreta formas. Goma (E) borra dibujos, con un solo undo por gesto. Shift restringe líneas y flechas; Usar este lápiz continúa con el estilo de una selección. La selección rectangular permite tomar varios trazos para emprolijar o pasar a texto.

El selector compartido ofrece 24 tonos y colores personalizados; Agregar guarda la muestra y aplica el color. La paleta del lápiz se cierra al elegir o cambiar de herramienta para dejar lugar al gesto. En propiedades, cada selector se despliega cuando hace falta. La conversión a texto conserva los originales hasta confirmar y se puede deshacer. Si el dispositivo no reconoce español, se ofrece escribir el texto. El suavizado geométrico no equivale a reconocimiento de letras ni al refinamiento de Smart Script.

Herramientas priorizadas por esta revisión: goma reversible, control previo del grosor, líneas con Shift y reutilización del lápiz. Todas resuelven gestos concretos sin ampliar el contrato. Reconocimiento general de escritura, presión del stylus y otros instrumentos necesitan validación antes de incorporarse.

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

La cámara narrativa se edita en «Editar pasos»: enfoque y transición. «Seguir con la cámara» controla el canvas del editor; Presentar usa su cámara independiente. El viaje interpola el centro de la vista y se aleja entre elementos lejanos antes de acercarse al destino. Pausa y movimiento manual cancelan el viaje pendiente; una pestaña nueva no hereda ese movimiento. Con reduced-motion se conserva el encuadre y se elimina la transición.

## Animación para todo público (ADR 069)

El editor abre con un reproductor compacto, sin desplegar los ajustes. Reproducir/pausar y anterior/siguiente están siempre a mano; el texto muestra qué paso está ocurriendo. «Editar pasos» abre un panel separado en la parte inferior del lienzo. «Bajar panel» lo pliega sin detener ni borrar el recorrido. Su borde se arrastra hacia abajo para liberar espacio; flechas arriba/abajo ajustan la altura y End lo pliega, devolviendo el foco al botón de edición.

La edición habitual ofrece tarjetas numeradas, texto, duración en segundos, enfoque y transición. Seleccionar un campo pausa la reproducción. Los segundos se convierten a milisegundos al enviar la acción canónica; undo sigue separado de reproducción y altura del panel. Estados, encuadres, escenarios y pistas quedan disponibles en opciones avanzadas. El desplazamiento automático sólo afecta la tira de pasos para mantener visible el paso actual, nunca el scroll de la página. No hay cambio de schema.

Las superficies conservan Manrope/Plex y tinta/papel/azul/lima, con separación entre lienzo, herramientas y asistente; nombres cotidianos y menos metadatos técnicos a la vista. El tutorial explica el reproductor y cómo recuperar espacio. Se requiere feedback con personas reales antes de afirmar facilidad universal de uso.

## Escenarios de referencia

Compra confirmada: inventario → pasarela → autorización → pedido → fan-out de email/envío/auditoría. Rechazo: pendiente → aviso → otro medio → retry a pasarela → recuperación. Rama alternativa de expiración/cancelación/liberación de stock.

La diferencia debe estar en topología y estados, no sólo color. Labels y caption explican incluso sin distinguir tonos. Separar la lógica semántica de animación, las partículas visuales y la narrativa de marketing.

## Prueba visual de fase

Desktop 1440×900 y 1920×1080; tablet 1024×768; móvil 390×844. Abrir los tres fixtures, mover, seleccionar, editar, reproducir, cambiar escenario, importar/exportar y revisar errores. En diagramas grandes usar pan/zoom/fit; no hacer etiquetas ilegibles para meter todo en una pantalla. Capturar evidencia si se dispone de browser; si no, registrar la limitación sin inventar screenshots.
