# Diagramía --- Decisiones de producto, métricas, infraestructura y negocio

> Documento de síntesis de la sesión de trabajo.\
> **Etapa:** MVP / validación\
> **Objetivo:** construir Diagramía con una lógica *Lean Startup*, bajo
> costo operativo, instrumentación desde el inicio y arquitectura
> preparada para escalar.

------------------------------------------------------------------------

## 1. Principio de trabajo: Lean Startup aplicado a Diagramía

La idea central no es simplemente "escuchar al cliente", sino construir
un ciclo de aprendizaje repetible:

**Hipótesis → construir → medir → observar → aprender → decidir →
experimentar de nuevo**

Diagramía debería desarrollarse desde el MVP como un sistema que permita
saber:

-   qué hacen realmente los usuarios;
-   dónde encuentran valor;
-   dónde se traban;
-   qué funciones usan y cuáles ignoran;
-   qué genera retención;
-   qué genera conversión;
-   qué tan útil resulta la IA;
-   cuánto cuesta servir a cada usuario;
-   qué cambios mejoran o empeoran el producto.

No alcanza con preguntar "¿te gustó?". Hay que combinar **telemetría
cuantitativa + observación cualitativa + feedback explícito**.

### North Star Metric propuesta

**Diagramas útiles completados por usuario activo por semana.**

Un "diagrama útil" no debería significar solamente `diagram_created`.
Puede considerarse útil si presenta alguna señal de valor, por ejemplo:

-   fue guardado;
-   fue exportado;
-   fue compartido;
-   fue reabierto;
-   tuvo una sesión de edición significativa.

------------------------------------------------------------------------

# 2. Instrumentación y métricas

Conviene desarrollar la captación de datos desde el MVP, incluso para
métricas que recién serán importantes cuando Diagramía crezca.

## 2.1 Adquisición

Registrar:

-   visitantes únicos;
-   sesiones;
-   nuevos vs. recurrentes;
-   país/idioma aproximado;
-   dispositivo;
-   navegador;
-   sistema operativo;
-   fuente de tráfico;
-   referral;
-   UTM source / medium / campaign;
-   landing de entrada;
-   conversión landing → abrir pizarra;
-   conversión landing → registro;
-   conversión pizarra anónima → registro;
-   porcentaje orgánico;
-   porcentaje referido;
-   posteriormente: CAC;
-   costo por registro;
-   costo por usuario activado.

La finalidad no es medir "visitas" por vanidad, sino descubrir qué
canales traen **usuarios que realmente obtienen valor**.

------------------------------------------------------------------------

## 2.2 Embudo de registro

Decisión actual:

-   la pizarra puede utilizarse sin iniciar sesión;
-   la IA requiere una cuenta;
-   las funciones cloud también pueden utilizar el registro como punto
    de conversión.

Embudo sugerido:

``` text
landing_view
    ↓
board_opened
    ↓
first_element_created
    ↓
ai_opened
    ↓
signup_started
    ↓
signup_completed
    ↓
ai_first_prompt
    ↓
useful_diagram_created
```

Medir:

-   porcentaje que abre el canvas;
-   porcentaje que intenta utilizar IA;
-   conversión intento IA → registro;
-   abandono del registro;
-   método de autenticación;
-   tiempo hasta registro;
-   usuarios que vuelven después del registro.

Una métrica especialmente importante:

**AI gate conversion = usuarios que se registran al intentar utilizar IA
/ usuarios que intentan utilizar IA**

------------------------------------------------------------------------

# 3. Activación

Durante el MVP, ésta es una de las áreas más importantes.

Medir:

-   tiempo landing → canvas;
-   tiempo hasta crear primer elemento;
-   **Time To First Diagram**;
-   **Time To First Value**;
-   porcentaje que crea al menos un elemento;
-   porcentaje que crea varios elementos;
-   porcentaje que conecta nodos;
-   porcentaje que completa un diagrama;
-   porcentaje que guarda;
-   porcentaje que exporta;
-   porcentaje que comparte;
-   porcentaje que utiliza IA;
-   porcentaje que genera su primer diagrama mediante IA;
-   porcentaje que modifica lo generado por IA;
-   abandono sin acciones;
-   última acción antes del abandono.

Pregunta central:

> ¿Qué porcentaje de personas obtiene algo útil de Diagramía durante sus
> primeros minutos?

------------------------------------------------------------------------

# 4. Telemetría del editor

Eventos potenciales:

``` text
node_created
node_deleted
node_moved
node_resized
edge_created
edge_deleted
text_added
shape_changed
color_changed
undo
redo
zoom
pan
copy
paste
multi_select
template_used
export
share
save
```

Métricas derivadas:

-   nodos promedio por diagrama;
-   conexiones promedio;
-   duración de sesión;
-   acciones por sesión;
-   undo/redo por sesión;
-   herramientas más utilizadas;
-   herramientas ignoradas;
-   templates más utilizados;
-   tipos de diagramas;
-   tamaño de diagramas;
-   exportaciones;
-   formatos de exportación;
-   porcentaje de diagramas compartidos.

Los eventos también pueden detectar problemas de UX. Por ejemplo, muchos
`undo` inmediatamente después de determinada operación pueden indicar
una interacción confusa.

------------------------------------------------------------------------

# 5. Métricas específicas de IA

La IA es una de las diferenciaciones centrales de Diagramía, por lo que
debe medirse particularmente bien.

Registrar por interacción:

-   apertura del asistente;
-   prompt enviado;
-   categoría del prompt;
-   longitud;
-   modelo utilizado;
-   tokens de entrada;
-   tokens de salida;
-   costo estimado;
-   latencia;
-   éxito/error;
-   generación cancelada;
-   regeneración;
-   resultado insertado;
-   resultado descartado;
-   modificaciones posteriores;
-   tiempo hasta modificar;
-   cantidad de modificaciones;
-   undo posterior a generación;
-   nuevo prompt posterior a generación.

## Indicadores derivados

### AI Acceptance Rate

``` text
resultados de IA utilizados / generaciones realizadas
```

### AI Regeneration Rate

``` text
regeneraciones / generaciones
```

### AI Edit Rate

Porcentaje de resultados generados que necesitan edición posterior.

### AI Immediate Undo Rate

Porcentaje de generaciones inmediatamente deshechas.

### Economía

-   costo IA por usuario activo;
-   costo IA por usuario Free;
-   costo IA por diagrama útil;
-   costo IA por usuario convertido a pago.

También comparar:

**retención de usuarios que utilizan IA vs. usuarios que sólo utilizan
el editor manual.**

------------------------------------------------------------------------

# 6. Almacenamiento

Decisión considerada para Free:

**hasta 3 diagramas almacenados en cloud**, con un límite razonable de
tamaño.

Medir:

-   diagramas guardados;
-   tamaño promedio;
-   percentiles de tamaño;
-   almacenamiento por usuario;
-   usuarios con 1/3, 2/3 y 3/3 diagramas;
-   usuarios que alcanzan el límite;
-   usuarios que eliminan un diagrama para crear otro;
-   conversión después de alcanzar el límite;
-   abandono después del límite;
-   reaperturas;
-   diagramas nunca reabiertos.

Esto permitirá determinar si el límite de tres diagramas funciona como
incentivo comercial o genera demasiada fricción.

------------------------------------------------------------------------

# 7. Retención

Medir cohortes:

-   D1;
-   D3;
-   D7;
-   D14;
-   D30;
-   D60;
-   D90.

Además:

-   DAU;
-   WAU;
-   MAU;
-   DAU/MAU;
-   sesiones por usuario;
-   diagramas por usuario/semana;
-   días activos;
-   tiempo entre sesiones;
-   usuarios reactivados;
-   churn;
-   resurrection rate.

Separar cohortes de:

-   visitantes;
-   registrados;
-   usuarios que completaron un diagrama;
-   usuarios IA;
-   usuarios Free;
-   posteriormente, usuarios pagos.

------------------------------------------------------------------------

# 8. Monetización

Cuando existan planes pagos:

-   Free → Pro;
-   Free → Team;
-   trial → pago;
-   MRR;
-   ARR;
-   ARPU;
-   ARPPU;
-   churn;
-   revenue churn;
-   LTV;
-   CAC;
-   LTV/CAC;
-   tiempo hasta conversión;
-   conversión por fuente;
-   conversión según funciones utilizadas;
-   conversión por alcanzar límite IA;
-   conversión por alcanzar almacenamiento;
-   upgrades;
-   downgrades;
-   cancelaciones;
-   motivo de cancelación;
-   reactivaciones.

Un análisis futuro especialmente valioso:

> identificar qué comportamiento del producto predice mejor que un
> usuario terminará pagando.

------------------------------------------------------------------------

# 9. Teams, Enterprise, API y MCP

Aunque no sea parte del MVP inicial, conviene preparar el modelo de
eventos para:

-   organizaciones;
-   workspaces;
-   miembros;
-   invitaciones;
-   invitaciones aceptadas;
-   colaboración;
-   comentarios;
-   menciones;
-   edición simultánea;
-   diagramas por organización;
-   seats;
-   administradores activos;
-   SSO;
-   API;
-   MCP.

Para el futuro MCP de Diagramía:

-   conexiones MCP;
-   herramientas invocadas;
-   proveedor/origen compatible;
-   diagramas creados mediante MCP;
-   modificaciones mediante MCP;
-   errores;
-   sesiones;
-   usuarios activos;
-   conversión MCP → editor.

La integración profunda con agentes/IA puede convertirse en una
diferenciación importante de Diagramía.

------------------------------------------------------------------------

# 10. Rendimiento y confiabilidad

Registrar:

-   tiempos de carga;
-   Core Web Vitals relevantes;
-   errores JavaScript;
-   errores de API;
-   errores de IA;
-   timeouts;
-   latencia IA;
-   tiempo de guardado;
-   crashes;
-   diagramas que fallan al cargar;
-   pérdida de cambios;
-   disponibilidad;
-   rendimiento según complejidad del diagrama;
-   errores por navegador/dispositivo.

------------------------------------------------------------------------

# 11. Feedback cualitativo

Además de analytics, incorporar feedback contextual y breve.

Después de una generación IA:

``` text
¿Te sirvió este resultado?

👍 Sí
👎 No
```

Si la respuesta es negativa:

-   no entendió el pedido;
-   resultado incorrecto;
-   demasiado simple;
-   demasiado complejo;
-   diseño malo;
-   faltan elementos;
-   otro.

Otras herramientas:

-   CSAT;
-   NPS cuando exista suficiente uso;
-   feature requests;
-   bug reports;
-   votos;
-   motivo de cancelación;
-   invitaciones a entrevistas.

Evitar bombardear al usuario con encuestas.

## Pruebas de usabilidad

Dar una tarea concreta sin explicar cómo funciona Diagramía y observar:

-   dónde duda;
-   clics incorrectos;
-   qué busca;
-   qué esperaba;
-   qué no encuentra;
-   qué pregunta;
-   cuánto tarda;
-   workarounds;
-   momentos de frustración;
-   momentos "ahá".

------------------------------------------------------------------------

# 12. Dashboard del fundador

Aunque se almacenen muchos eventos, el dashboard principal no debería
mostrar cientos de métricas.

Indicadores iniciales:

1.  visitante → canvas;
2.  canvas → primer elemento;
3.  conversión a registro;
4.  Time To First Value;
5.  primer diagrama útil;
6.  adopción de IA;
7.  AI Acceptance Rate;
8.  retención D7;
9.  diagramas útiles por WAU;
10. feedback negativo / fricción.

------------------------------------------------------------------------

# 13. Comunidad y adquisición orgánica

Objetivo: empezar a participar de comunidades antes de necesitar
promocionar agresivamente el producto.

## Reddit

Comunidades potenciales:

-   r/webdev
-   r/programming
-   r/SideProject
-   r/SaaS
-   r/startups
-   r/indiehackers
-   r/Entrepreneur
-   r/softwarearchitecture
-   r/devops
-   r/sysadmin
-   r/learnprogramming
-   r/reactjs
-   r/typescript
-   r/UXDesign
-   r/userexperience
-   r/ProductManagement
-   r/opensource

## Comunidades de diagramación

Particularmente interesantes porque contienen usuarios del mercado
objetivo:

-   Mermaid;
-   Excalidraw;
-   comunidades de herramientas visuales y diagram-as-code.

La estrategia no debería ser entrar a promocionar Diagramía, sino
investigar problemas reales.

Ejemplo:

> ¿Qué intentan hacer actualmente con Mermaid, Excalidraw, draw.io u
> otras herramientas que les resulta difícil o frustrante?

## Founders y makers

Explorar:

-   Indie Hackers;
-   Hacker News / Show HN;
-   Product Hunt;
-   DEV Community;
-   Peerlist;
-   DevHunt.

## X / Twitter

Construir presencia personal del fundador además de la cuenta de
Diagramía.

Temáticas:

-   #buildinpublic
-   #indiehackers
-   #SaaS
-   #webdev
-   #opensource
-   #devtools
-   #AI

Priorizar contenido con aprendizaje real:

``` text
Probamos cuánto tarda una persona que nunca vio Diagramía
en crear su primer diagrama.

Antes: 4:32
Después de modificar X: 2:51

Tres de cinco usuarios se trababan en el mismo lugar.
```

Esto combina adquisición orgánica con Lean Startup.

## Discord

Participar selectivamente en comunidades relacionadas con:

-   Mermaid;
-   Excalidraw;
-   React/JavaScript/TypeScript;
-   Python;
-   DevOps;
-   founders;
-   UI/UX;
-   Open Source;
-   IA/LLMs.

### Regla de comunidad propuesta

**70% ayudar y aprender + 20% Build in Public + 10% promoción.**

------------------------------------------------------------------------

# 14. Infraestructura

Diagramía debería aprovechar principalmente los recursos del
**cliente/navegador** para ejecutar el editor.

## Principio

El canvas, renderizado, interacción y buena parte del estado temporal
deberían ejecutarse client-side.

El backend se encarga principalmente de:

-   autenticación/autorización;
-   persistencia;
-   almacenamiento cloud;
-   sincronización;
-   analytics;
-   IA;
-   billing;
-   colaboración futura;
-   APIs/MCP.

Esto evita convertir cada movimiento de un nodo en trabajo del servidor.

## Infraestructura inicial

Actualmente existe un VPS Hostinger KVM 2 utilizado también para
ReservApp.

Para el MVP puede reutilizarse, siempre que Diagramía quede
correctamente aislada.

Arquitectura conceptual:

``` text
Internet
   │
   ▼
Reverse Proxy
   │
   ├── ReservApp
   │
   └── Diagramía
          ├── Backend/API
          ├── PostgreSQL
          ├── Redis (si hace falta)
          ├── Workers
          └── Analytics/telemetry
```

Usar contenedores separados y establecer límites de recursos para
impedir que Diagramía afecte a ReservApp.

## Persistencia de diagramas

Guardar preferentemente una representación estructurada (por ejemplo
JSON/versionado), no imágenes renderizadas como formato primario.

Autosave con debounce para evitar escrituras innecesarias.

En la etapa inicial, el costo importante probablemente sea **IA**, no el
almacenamiento de los diagramas.

------------------------------------------------------------------------

# 15. Landing y aplicación

Arquitectura recomendada:

``` text
diagramia.<tld>
```

→ landing/marketing/documentación.

``` text
app.diagramia.<tld>
```

→ editor.

Esto no debería producir fricción siempre que **Crear diagrama** lleve
directamente al editor.

Flujo ideal:

``` text
Landing
   │
   └── Crear diagrama
          │
          ▼
       Canvas
```

No exigir registro antes de experimentar el editor.

El registro aparece cuando el usuario intenta acceder a valor que
justifica una identidad:

-   IA;
-   almacenamiento cloud;
-   sincronización;
-   colaboración;
-   otras funciones de cuenta.

La landing debe funcionar como **rampa de acceso**, no como peaje.

------------------------------------------------------------------------

# 16. "Empresa de agentes" de bajo costo

Concepto explorado: utilizar agentes especializados para interpretar
continuamente la información de Diagramía.

Roles posibles:

-   Data/Product Agent;
-   CTO Agent;
-   CFO Agent;
-   Marketing/Growth Agent;
-   eventualmente un CEO/Strategy Agent que sintetice los demás
    reportes.

No deberían tomar decisiones empresariales irreversibles
automáticamente. Su función inicial es **analizar, detectar anomalías,
formular hipótesis y priorizar información para el fundador**.

## MVP recomendado

Empezar únicamente con:

### Data & Product Agent

Ejecutar un análisis diario o semanal sobre **datos preagregados**, no
sobre millones de eventos crudos.

Debe responder:

1.  ¿Qué cambió?
2.  ¿Cuánto cambió?
3.  ¿Qué podría explicarlo?
4.  ¿Qué hipótesis conviene probar?
5.  ¿Qué métrica permitiría validar esa hipótesis?

Ejemplo:

``` text
Durante los últimos 7 días:

- First Diagram Completion cayó 12%.
- La caída se concentra en usuarios móviles.
- Coincide con un aumento del 31% de undo después de edge_created.

Hipótesis:
La nueva interacción de conexiones está generando fricción en mobile.

Experimento sugerido:
...
```

## Costos

Si los datos se agregan previamente y sólo se envía al modelo un resumen
diario/semanal, el consumo de IA puede mantenerse en **centavos o pocos
dólares mensuales** durante el MVP.

Objetivo inicial aproximado:

**\< USD 5/mes para el agente**, sujeto al modelo, frecuencia y volumen
de contexto.

Luego, si demuestra utilidad, agregar CTO/CFO/Growth y finalmente un
agregador estratégico.

------------------------------------------------------------------------

# 17. Autenticación

Decisión conceptual: **tercerizar identidad**, no construir
autenticación desde cero.

Se analizaron Clerk y Firebase.

Para Diagramía se propuso **Firebase Authentication** como opción
atractiva porque permite mantener una UI de login totalmente integrada
al producto.

Flujo visual:

``` text
Diagramía
┌────────────────────────────┐
│ Continuar con Google       │
│ Continuar con Apple        │
│ Continuar con email        │
└────────────────────────────┘
```

Sin necesidad de que el usuario sienta que fue enviado a otra
aplicación.

## MVP de autenticación

Inicialmente:

-   Google;
-   email.

Posteriormente:

-   Apple;
-   otros proveedores;
-   teléfono sólo si los datos demuestran una necesidad.

El login por teléfono agrega costos de SMS y superficie de fraude, y no
parece necesario para validar un diagramador SaaS.

## Desacoplamiento

Firebase no debería convertirse en la base de negocio de Diagramía.

Arquitectura:

``` text
Firebase Auth
      │
      ▼
Identidad verificada
      │
      ▼
Diagramía Backend
      │
      ▼
PostgreSQL
  users
  organizations
  subscriptions
  diagrams
  ...
```

Diagramía mantiene un identificador interno y sus propios datos.

Así se puede reemplazar el proveedor de identidad en el futuro con menor
impacto.

------------------------------------------------------------------------

# 18. Pagos internacionales desde Argentina

El objetivo es poder vender Diagramía tanto en Argentina como
internacionalmente.

Stripe es muy utilizado globalmente, pero una empresa constituida
localmente en Argentina no puede simplemente abrir una cuenta Stripe
estándar argentina como merchant. Esto es distinto de que un **cliente
argentino pueda pagar** en un checkout procesado por Stripe.

Por lo tanto, para el MVP se analizaron alternativas orientadas a SaaS
internacional.

## Paddle

Interesante por su modelo **Merchant of Record (MoR)**.

En ese esquema, el proveedor gestiona buena parte de:

-   procesamiento;
-   suscripciones;
-   impuestos indirectos internacionales;
-   VAT/GST/sales tax;
-   chargebacks/compliance relacionado;
-   documentación transaccional.

## Lemon Squeezy

También orientado a software/SaaS y con modelo Merchant of Record.

Queda como alternativa especialmente relevante a comparar con Paddle.

## PayPal

Puede ofrecerse como método adicional, pero no se propuso como núcleo
del sistema de billing de Diagramía.

## Mercado Pago

Puede ser útil posteriormente para Argentina/LATAM, pero no conviene
construir el billing global alrededor exclusivamente de Mercado Pago si
el público objetivo es internacional.

------------------------------------------------------------------------

# 19. Arquitectura de billing

Evitar acoplar el producto directamente a un proveedor.

``` text
Diagramía
    │
    ▼
Billing Service
    │
    ├── Paddle (inicial)
    ├── Lemon Squeezy
    ├── Stripe (futuro si corresponde)
    └── otros
```

Diagramía trabaja internamente con eventos propios:

``` text
subscription_started
subscription_updated
subscription_cancelled
payment_succeeded
payment_failed
plan_upgraded
plan_downgraded
```

Los webhooks del proveedor se traducen a eventos internos.

Esto permite migrar posteriormente sin reconstruir la lógica completa de
planes.

## Orientación inicial

**Paddle como candidato principal.**\
**Lemon Squeezy como alternativa fuerte.**

Las comisiones y condiciones deben volver a verificarse en la
documentación oficial inmediatamente antes de implementar, ya que pueden
cambiar.

------------------------------------------------------------------------

# 20. Prevención de abuso de IA gratuita

Problema:

> Un usuario podría crear cinco cuentas y multiplicar artificialmente su
> cuota gratuita de IA.

No existe una protección única perfecta. La estrategia debe combinar
varias señales sin perjudicar excesivamente a usuarios legítimos.

## Capas propuestas

### 1. Email verificado

La IA requiere una cuenta válida y verificada.

### 2. Cuota por cuenta

Ejemplo conceptual:

``` text
N generaciones / mes
+
límite diario razonable
```

La cuota exacta se definirá según:

-   costo real;
-   comportamiento;
-   conversión;
-   abuso observado.

### 3. Rate limiting

Aplicar límites por:

-   usuario;
-   IP;
-   sesión;
-   endpoint;
-   ventana temporal.

### 4. Fingerprinting suave

Utilizar señales de dispositivo como **señales de riesgo**, no como
identidad absoluta.

No bloquear automáticamente sólo porque dos cuentas comparten una IP:
universidades, empresas, hogares y VPN pueden compartirla legítimamente.

### 5. Detección de comportamiento

Ejemplo sospechoso:

``` text
Cuenta nueva
→ consume 100% del cupo IA
→ deja de utilizarse

Nueva cuenta
→ mismo patrón

Nueva cuenta
→ mismo patrón
```

El sistema aumenta progresivamente el nivel de riesgo.

### 6. CAPTCHA adaptativo

No mostrar CAPTCHA a todo el mundo.

Activarlo ante señales sospechosas.

### 7. Protección de credenciales

Las claves de proveedores de IA jamás deben estar disponibles en
frontend.

``` text
Browser
   │
   ▼
Diagramía API
   │
   ▼
AI Gateway
   │
   ▼
Proveedor/modelo
```

### 8. Presupuesto global

Implementar límites globales de seguridad.

Si el gasto gratuito de IA crece de manera anormal:

-   alertar;
-   reducir temporalmente cuotas;
-   endurecer rate limits;
-   investigar la causa.

### 9. Economía del abuso

Principio:

> El plan gratuito debe entregar suficiente IA para descubrir el valor
> del producto, pero no tanta como para que crear cuentas falsas sea
> significativamente más conveniente que pagar.

------------------------------------------------------------------------

# 21. Arquitectura conceptual consolidada

``` text
                         ┌──────────────────┐
                         │    Landing       │
                         │ diagramia.tld    │
                         └────────┬─────────┘
                                  │
                         Crear diagrama
                                  │
                                  ▼
                    ┌────────────────────────┐
                    │   app.diagramia.tld    │
                    │                        │
                    │ Canvas / Editor        │
                    │ Animaciones            │
                    │ IA Assistant           │
                    └───────────┬────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
          Firebase Auth     Diagramía API   Telemetry
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
            PostgreSQL      AI Gateway     Billing Service
                                │              │
                                ▼              ▼
                          Modelo IA       Paddle / MoR
                                │
                                ▼
                       Usage / Cost Events
                                │
                                ▼
                         Analytics Store
                                │
                                ▼
                       Data/Product Agent
                                │
                                ▼
                       Founder Dashboard
```

------------------------------------------------------------------------

# 22. Principios de producto acordados

### 1. Valor antes que registro

El usuario puede experimentar la pizarra inmediatamente.

### 2. IA requiere identidad

Permite controlar costos y abuso.

### 3. Medir desde el MVP

No intentar reconstruir comportamiento histórico posteriormente.

### 4. Browser-first

El cliente ejecuta la mayor parte del trabajo gráfico.

### 5. Backend liviano

El servidor se concentra en aquello que realmente necesita
autoridad/persistencia.

### 6. Proveedores desacoplados

Auth, IA y billing deben poder reemplazarse.

### 7. Comunidad antes que publicidad masiva

Construir audiencia mientras se aprende del mercado.

### 8. IA como producto, no como gimmick

Medir si realmente mejora creación, velocidad, retención y satisfacción.

### 9. Agentes como analistas

Primero ayudan al fundador a interpretar la empresa; no administran
autónomamente decisiones importantes.

### 10. Lean Startup también para la infraestructura interna

No construir cuatro agentes antes de comprobar que uno genera valor.

------------------------------------------------------------------------

# 23. Orden sugerido de implementación

## Fase 1 --- Instrumentación base

-   definir esquema de eventos;
-   analytics;
-   identificación anónima;
-   sesiones;
-   UTMs;
-   eventos del editor;
-   errores;
-   performance.

## Fase 2 --- Auth

-   Firebase;
-   Google;
-   email;
-   vinculación anonymous session → user;
-   modelo interno de usuario.

## Fase 3 --- IA

-   AI Gateway backend;
-   cuotas;
-   rate limits;
-   tracking de tokens/costos;
-   feedback 👍/👎;
-   métricas de aceptación;
-   controles básicos antifraude.

## Fase 4 --- Cloud

-   persistencia;
-   límite Free;
-   autosave;
-   versionado básico;
-   medición de almacenamiento.

## Fase 5 --- Dashboard Lean

Mostrar las métricas realmente necesarias para tomar decisiones.

## Fase 6 --- Data/Product Agent

``` text
Analytics
   ↓
Agregación diaria/semanal
   ↓
Agente
   ↓
Reporte
   ↓
Hipótesis/experimentos
```

## Fase 7 --- Billing

-   abstraction layer;
-   integración MoR;
-   planes;
-   webhooks;
-   subscriptions;
-   métricas financieras.

## Fase 8 --- Comunidad / Build in Public

En realidad debe empezar en paralelo al desarrollo:

-   ayudar;
-   observar;
-   entrevistar;
-   mostrar avances;
-   reclutar testers;
-   publicar aprendizajes.

------------------------------------------------------------------------

# 24. El ciclo operativo de Diagramía

El objetivo final de todo lo anterior es que el desarrollo funcione así:

``` text
          ┌───────────────┐
          │   HIPÓTESIS   │
          └───────┬───────┘
                  ▼
          ┌───────────────┐
          │ EXPERIMENTO   │
          └───────┬───────┘
                  ▼
          ┌───────────────┐
          │   USUARIOS    │
          └───────┬───────┘
                  ▼
      ┌───────────────────────┐
      │ Datos + Observación   │
      │ + Feedback            │
      └───────────┬───────────┘
                  ▼
          ┌───────────────┐
          │   APRENDER    │
          └───────┬───────┘
                  ▼
        ┌───────────────────┐
        │ Mantener / Cambiar│
        │ / Descartar       │
        └─────────┬─────────┘
                  │
                  └──────────────► nueva hipótesis
```

El propósito de las métricas, la comunidad, la telemetría, los agentes y
la infraestructura no es agregar complejidad.

Es conseguir que **cada iteración de Diagramía produzca aprendizaje
verificable sobre el usuario y el negocio**.

------------------------------------------------------------------------

## Resumen de decisiones actuales

  Área                   Dirección actual
  ---------------------- ----------------------------------------------
  Metodología            Lean Startup
  North Star             Diagramas útiles / usuario activo / semana
  Canvas                 Browser-first
  Landing                Dominio principal
  Editor                 `app.` como subdominio
  Editor sin cuenta      Sí
  IA sin cuenta          No
  Auth                   Firebase como candidato principal
  Login inicial          Google + email
  Teléfono               No inicialmente
  Base de datos          Propia
  Diagramas Free cloud   3 como hipótesis inicial
  Infra MVP              Reutilizar VPS si hay aislamiento/recursos
  IA                     Gateway backend + cuotas + telemetría
  Antifraude             Defensa multicapa basada en riesgo
  Billing                Capa desacoplada
  Pagos globales         MoR como estrategia preferida
  Candidato billing      Paddle
  Alternativa            Lemon Squeezy
  Mercado Pago           Complementario/local, no núcleo global
  Agentes                Empezar con Data/Product
  Reporte agente         Diario o semanal
  Comunidad              Desarrollo orgánico + Build in Public
  Estrategia comunidad   70% ayudar / 20% compartir / 10% promocionar

------------------------------------------------------------------------

**Estado:** decisiones de arquitectura/producto para validar durante el
desarrollo del MVP; límites, precios, proveedores y costos deben
revisarse contra datos reales y condiciones vigentes antes de
producción.
