# Decisiones del MVP — DiagramIa

## Producto y acceso

- **Pizarra sin cuenta:** cualquier persona puede crear y editar diagramas.
- **IA con cuenta obligatoria:** iniciar sesión en DiagramIa habilita generación y edición con IA. El servidor valida identidad, cuota y límites.
- **Invitado:** puede guardar un borrador en el navegador y exportar/importar un archivo local. El borrador del navegador solo está disponible en ese dispositivo y puede perderse si se borran sus datos.
- **Cuenta:** ofrece guardado automático en la nube y acceso desde otros dispositivos.

## Almacenamiento

- **No integrar Google Drive en el MVP.** Añade un paso de conexión y autorización que puede frenar a los usuarios.
- Ofrecer almacenamiento propio de DiagramIa para las cuentas y archivo local descargable para todos.
- **Plan gratuito: hasta 3 diagramas guardados en la nube, 10 MB por diagrama y 30 MB totales por cuenta.** El límite cuenta el diagrama, adjuntos y versiones almacenadas.
- Antes de guardar o subir adjuntos, mostrar el tamaño y cuánto espacio queda. Si se alcanza el límite, permitir descargar el diagrama, borrar uno o pasar a un plan superior; no borrar contenido automáticamente.
- Importar un archivo local a una cuenta debe permitir guardarlo en la nube si hay espacio disponible.

**Por qué 10 MB:** los diagramas de texto y formas suelen ocupar muy poco; las imágenes y adjuntos son lo que más aumenta el tamaño. Diez megabytes deja margen para varios recursos visuales sin convertir el plan gratuito en almacenamiento ilimitado.

## IA y plan gratuito

- **Modelo de la IA Free: GPT-6 Luna** (`gpt-6-luna`, OpenAI), decidido el 02/10/2026 por su costo (ADR 045). Identificador y API confirmados en documentación oficial; falta medir costo, calidad y correcciones con uso real. La capa de integración permite cambiar de modelo.
- La IA debe interpretar el tipo de diagrama, las etapas, decisiones, excepciones y participantes (“calles” o *swimlanes*), y devolver una estructura validable que la pizarra renderiza. Ejemplo: compra con calles Cliente, Carrito, Vendedor y Mercado Pago.
- **Cuota inicial a probar:** 20 créditos de IA al mes, máximo 6 al día; crear un diagrama cuesta 2 créditos y editar o explicar uno cuesta 1. Reinicio mensual y límites aplicados en servidor. Ajustar tras medir uso real y costo por sesión.
- Los tres diagramas son el límite de **guardado en nube**, no una prohibición de crear o exportar más diagramas localmente.

## Planes comerciales

| Plan | Propuesta |
|---|---|
| Gratis | Pizarra, cuenta para usar IA, cuota inicial de IA y 3 diagramas en nube (10 MB cada uno; 30 MB totales). |
| Pro | Más créditos de IA, más diagramas y almacenamiento, historial de versiones y exportaciones ampliadas. |
| Equipo | Espacio compartido, colaboración, administración de miembros y facturación centralizada. |
| Empresa | SSO, controles de acceso, administración y soporte; condiciones de datos y contrato acordadas con cada cliente. |

**Pendiente antes de publicar precios:** definir cuotas exactas de Pro, Equipo y Empresa luego de medir costo por usuario activo, almacenamiento promedio y disposición a pagar. Evitar prometer créditos “ilimitados”; usar cuotas transparentes y mecanismos contra abuso.

## Alcance recomendado para el MVP

1. Pizarra invitada con borrador local y exportación/importación.
2. Registro e inicio de sesión para usar IA y guardar diagramas en la nube.
3. Tres espacios de guardado gratuito, con topes visibles de 10 MB por diagrama y 30 MB por cuenta.
4. Métricas de costo por generación, tokens, tamaño de archivo y usuarios activos para ajustar cuotas y precios.
5. Dejar Google Drive y funciones empresariales avanzadas para una etapa posterior, según demanda.
