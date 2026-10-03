# Rendimiento (P8.2)

Medido el 02/10/2026 en un Intel Core i5-14400F (16 núcleos, 16 GB), Node 22.23.1 y Chrome headless sin GPU. Los documentos son sintéticos: zonas de 20 nodos, una cadena de conexiones y un cruce cada tres nodos (≈1,3 conexiones por nodo, con etiquetas). Para repetirlo:

- `npm run perf:core`: operaciones del core.
- `npm run dev -w @diagramia/editor -- --port 5174`, y después `DIAGRAMIA_URL=http://127.0.0.1:5174/ npm run perf:browser`.
- Para medir producción: `npm run build -w @diagramia/editor` y `npx vite preview --port 5175` en `apps/editor`.

Los resultados quedan en `state/perf/` (no versionado).

## Presupuesto

| Tamaño | Compromiso |
|---|---|
| Hasta 500 nodos | Arrastre y zoom sin tareas largas (>50 ms) en el build de producción. Carga en menos de 0,5 s. |
| Hasta 2000 nodos (tope del documento) | Usable: carga en menos de 1 s; arrastre y zoom con demora visible (100–250 ms por cuadro). |
| Pedido de IA | Validar y ordenar la propuesta en el servidor: menos de 0,5 s con 2000 nodos. |

## Mediciones

Core (mediana de 3 corridas, ms):

| Nodos / conexiones | Validar | Aplicar 1 acción | Vista previa | Ordenar propuesta | Rutear todo | Superposiciones |
|---|---|---|---|---|---|---|
| 100 / 132 | 1,7 | 4,2 | 10,6 | 23,9 | 12,1 (antes 50,8) | 1,2 |
| 500 / 665 | 3,0 | 8,3 | 30,0 | 77,9 | 17,8 (antes 33,9) | 19,8 |
| 1999 / 2664 | 12,1 | 28,3 | 119,6 | 425,4 (antes 603,7) | 71,6 (antes 221,6) | 251,6 |

Editor en build de producción (ms; un «cuadro» incluye esperar dos `requestAnimationFrame`, unos 33 ms de piso en headless):

| Nodos | Carga | Arrastre (mediana / p95) | Tareas largas al arrastrar | Zoom (mediana) | Tareas largas en zoom |
|---|---|---|---|---|---|
| 100 | 146 | 50 / 52 | 0 | 67 | 0 |
| 500 | 208 | 51 / 71 | 0 | 66 | 0 |
| 1999 | 399 | 100 / 245 | 23 (máx. 162) | 132 | 10 |

## Qué se optimizó

El ruteo de conexiones recorría todos los nodos por cada conexión para buscar obstáculos, comparaba cada etiqueta con todos los nodos y con las etiquetas ya ubicadas, y en documentos de hasta 250 conexiones comparaba cada tramo con todos los ya trazados. Durante un arrastre esto se repetía en cada movimiento del mouse. Ahora:

- **Índice espacial en grilla.** Devuelve los mismos candidatos en el mismo orden, y el criterio exacto se aplica igual que antes.
- **Poda exacta de rutas candidatas.** Todos los términos del puntaje son no negativos, así que una candidata se descarta en cuanto lo ya sumado no puede ganarle a la mejor.

Antes de cambiar nada se tomaron huellas de las rutas de los cuatro ejemplos y de cinco documentos sintéticos (60 a 1200 nodos, con conexiones ortogonales, rectas y curvas). Después del cambio, las 9 huellas son idénticas.

## Límites conocidos

- Con más de 500 nodos, el canvas dibuja todo el documento aunque esté fuera de la vista. El recorte por viewport y el ruteo incremental durante el arrastre quedan como mejoras si los datos muestran documentos así de grandes.
- `findOverlaps` y el ordenamiento tras una propuesta de IA crecen más rápido que lineal: unos 0,25 s y 0,43 s con 2000 nodos.
- Falta medir en un equipo modesto y en un teléfono real (revisión manual de P8.1).
