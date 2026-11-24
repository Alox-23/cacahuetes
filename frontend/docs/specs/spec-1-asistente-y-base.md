# Spec técnica 1 · Frontend: asistente y base de la app

24 nov 2026

## Objetivo y alcance

Esta spec cubre la mitad «asistente» del frontend: la base de la app y todas las pantallas de chat con Cacahuete, el asistente de IA. No hay backend: todo funciona con datos y respuestas simulados en el cliente.

- **Incluye:** la base del proyecto, el sistema visual, la navegación, 10 pantallas y el guion del asistente simulado.
- **Queda fuera:** ruta, mapa, Mis rutas, registro y perfil, que están en la [spec 2](spec-2-ruta-mis-rutas-perfil.md).
- **No se implementa:** backend, IA real ni cálculo real de rutas.
- **Referencias:** [diseños de las pantallas](../design/screens/README.md) y [flujos](../design/flows.md).

Esta spec fija lo ya decidido. Todo lo demás lo decide y añade el desarrollador.

## Reparto entre los dos desarrolladores

Cada desarrollador es responsable de un bloque de pantallas y de una pieza compartida.

| Área | Spec 1 (esta) | Spec 2 |
| --- | --- | --- |
| Base del proyecto, tokens de diseño, componentes compartidos, barra de pestañas | Responsable | La usa |
| Inicio, preguntas iniciales y todas las pantallas de chat | Responsable |  |
| Guion del asistente simulado | Responsable |  |
| Ruta, mapa, detalle de lugar, cambiar parada |  | Responsable |
| Crear cuenta, entrar, guardar como invitado |  | Responsable |
| Mis rutas, valorar, perfil, preferencias, cuenta |  | Responsable |
| Módulo de datos simulados (preferencias, rutas, lugares, sesión) | Lo usa | Responsable |

El punto de unión es el contrato compartido de tipos y funciones, descrito más abajo. Conviene acordarlo entre los dos el primer día.

## Stack propuesto y base compartida

El stack es una propuesta; la base la monta este desarrollador y la usan los dos.

- **Framework:** React con TypeScript, diseño móvil primero, en un solo repositorio.
- **Formato de entrega:** web responsive o PWA frente a app nativa está por decidir entre los dos.
- **Tokens de diseño:** colores, tipografías, radios y espaciados definidos una sola vez (ver `design/tokens.json`).
- **Componentes compartidos:** botón principal y secundario, chip, opción seleccionable, campo de texto, tarjeta, cabecera, barra de pestañas y avatar de Cacahuete.
- **Textos:** en español, en archivos de traducción desde el primer día.
- **Estado:** en memoria y en el almacenamiento local del navegador, sin llamadas de red.

## Pantallas de esta spec

Son diez pantallas, todas diseñadas.

| Pantalla | Archivo de diseño | Qué hace |
| --- | --- | --- |
| Inicio | `Main.html` | Propuesta de valor, ruta de ejemplo, «Planificar mi ruta» y «Entrar» |
| Pregunta inicial 1 | `ChatInicio1.html` | Intereses, selección múltiple y «Listo» |
| Pregunta inicial 2 | `ChatInicio2.html` | Ritmo (una opción) y transporte (múltiple) |
| Pregunta inicial 3 | `ChatInicio3.html` | Compañía, una opción con respuesta rápida |
| Pregunta inicial 4 | `ChatInicio4.html` | Presupuesto, una opción; al responder pasa al chat principal |
| Chat principal | `Chat.html` | Preferencias guardadas con «Cambiar», sugerencias de petición y campo de texto |
| Petición y aclaración | `ChatPeticion.html` | Mensaje libre; el asistente pregunta solo lo que falta, con respuestas rápidas |
| Esto entendí | `ChatResumen.html` | Tarjeta con lo extraído del mensaje y de las preferencias, y «Crear ruta» |
| Creando la ruta | `Cargando.html` | Progreso por pasos con la mascota |
| Cambio por chat | `ChatCambio.html` | El asistente explica qué cambió en la ruta, con «Ver ruta actualizada» y «Deshacer» |

## Flujos

Cuatro flujos pasan por estas pantallas.

1. **Primera vez:** Inicio, las cuatro preguntas dentro del chat y chat principal. No hay registro, y las preguntas se hacen una sola vez, con opción «Omitir».
2. **Pedir una ruta:** mensaje libre, aclaración solo si falta ciudad, fecha, tiempo o punto de salida, y tarjeta «Esto entendí». Al confirmar se crea la ruta y se navega a la pantalla Ruta de la spec 2.
3. **Cambio por chat:** desde Ruta, «Pide un cambio al asistente» abre el chat. El asistente aplica el cambio y ofrece ver la ruta o deshacer.
4. **Cambiar preferencias:** el enlace «Cambiar» del chat abre Preferencias, de la spec 2. Una petición puntual en el chat no cambia las preferencias guardadas.

## Asistente simulado

Sin backend, el asistente es un guion que vive en el cliente y responde con datos preparados.

- **Preguntas iniciales:** guion fijo de cuatro preguntas con opciones cerradas. Las respuestas se guardan como preferencias y no se vuelven a preguntar. «Omitir» guarda valores por defecto.
- **Petición:** las tres sugerencias del chat principal tienen una respuesta preparada. Cualquier otro texto recibe una respuesta genérica que pide ciudad, fecha, tiempo y punto de salida con respuestas rápidas.
- **Esto entendí:** se compone con los datos de la petición y las preferencias guardadas, en dos grupos separados.
- **Cambio por chat:** los cuatro botones rápidos y dos o tres frases de ejemplo tienen cambios preparados.
- **Sensación de IA:** indicador de «escribiendo» y una espera simulada corta antes de cada respuesta.
- **Sustituible:** todo el guion queda detrás de una sola función, para cambiarlo por una API real más adelante sin tocar las pantallas.

```ts
type AssistantReply = {
  kind: "question" | "summary" | "change";
  text: string;
  options?: { label: string; value: string; multiple?: boolean }[];
  request?: RouteRequest;   // en "summary"
  changes?: string[];       // en "change"
};

function sendMessage(input: { text?: string; option?: string }): Promise<AssistantReply>;
```

## Reglas de UX y sistema visual

Los diseños son la referencia visual; estas son las reglas que no se ven a simple vista.

- **Zona del pulgar:** opciones, campos y botón principal van agrupados abajo, con el título arriba y sin hueco vacío bajo el contenido.
- **Chat:** los mensajes y las respuestas rápidas se anclan abajo, junto al campo de texto.
- **IA visible desde el inicio:** el asistente se presenta como IA en su primer mensaje, y su avatar y la etiqueta «Cacahuete · IA» aparecen en cada mensaje.
- **Accesibilidad:** objetivos táctiles de 44 px como mínimo y contraste de texto de 4,5:1.
- **Tipografías provisionales:** Space Grotesk para títulos e Inter para texto.
- **Provisional:** el nombre «Cacahuete», el nombre de la app y el dibujo de la mascota.

Paleta, basada en [Color Hunt](https://colorhunt.co/palette/2a1a0ed4621af4ae52fef3e2) con el marrón aclarado:

| Uso | Color |
| --- | --- |
| Fondo | #FEF3E2 |
| Botones, enlaces y texto | #4A2F1B |
| Estado al pasar el cursor | #2A1A0E |
| Chips, opciones seleccionadas y paradas | #F4AE52 |
| Línea de ruta y estrellas | #D4621A |
| Tarjetas | #FFFFFF |
| Borde de las burbujas del asistente | #E9C48A |

## Contrato compartido con la spec 2

Las dos mitades se hablan solo a través de estos tipos y funciones. Es una propuesta de partida para acordar entre los dos. El mismo contenido está en `contract/types.ts`.

```ts
type Preferences = {
  interests: string[];        // arquitectura, gastronomia, museos, naturaleza,
                              // historia, compras, vida_nocturna, arte_urbano
  pace: "relajado" | "equilibrado" | "intenso";
  transport: ("a_pie" | "transporte_publico" | "coche" | "bici")[];
  company: "solo" | "pareja" | "con_ninos" | "grupo";
  budget: "bajo" | "medio" | "alto";
  needs: string[];
};

type RouteRequest = {
  city: string;
  date: string;                               // AAAA-MM-DD
  timeWindow: { from: string; to: string };   // HH:MM
  start: { label: string };
  mustInclude: string[];
  overrides?: Partial<Preferences>;           // solo para esta ruta
};

type Stop = {
  order: number; placeId: string; name: string;
  arrive: string; visitMinutes: number;
  travelToNext?: { mode: string; minutes: number };
  locked: boolean;
};

type Route = {
  id: string; name: string; request: RouteRequest;
  stops: Stop[]; version: number; saved: boolean; favorite: boolean;
};
```

| Función | Responsable | Quién la usa |
| --- | --- | --- |
| `getPreferences`, `savePreferences` | Spec 2 | Las dos |
| `getSession` (invitado o cuenta), `register`, `login`, `logout` | Spec 2 | Las dos |
| `createRoute(request)` | Spec 2 | Spec 1, al confirmar «Esto entendí» |
| `refineRoute(id, action)`, `undo(id)` | Spec 2 | Las dos |
| `getRoute`, `listRoutes`, `saveRoute`, `deleteRoute`, `rateRoute` | Spec 2 | Spec 2 |
| `getPlace`, `getAlternatives(routeId, order)` | Spec 2 | Spec 2 |
| `sendMessage(input)` | Spec 1 | Spec 1 |

La navegación entre mitades usa tres puntos de entrada: Ruta (con el id de la ruta), Cambio por chat (con el id de la ruta) y Preferencias.

## Pantallas pendientes de diseñar

Estas pantallas y estados de esta mitad aún no tienen diseño.

- El asistente no entiende la petición.
- El asistente no responde o tarda demasiado.
- Ruta imposible: lo pedido no cabe en el tiempo disponible, con propuestas para ajustarla.
- Ciudad sin datos.
- Sin conexión.
- Historial de conversaciones anteriores.
- Enlaces legales y aviso de cookies en Inicio.
- Versión de escritorio del chat.

## Criterios de aceptación

- [ ] Las diez pantallas coinciden con los diseños a 390 px de ancho y funcionan a 360 px.
- [ ] El botón principal de cada pantalla queda en el tercio inferior, y el chat se ancla abajo.
- [ ] Un invitado completa las cuatro preguntas dentro del chat y llega al chat principal sin registrarse.
- [ ] Las cuatro preguntas no vuelven a aparecer al recargar la app ni después de crear cuenta.
- [ ] El primer mensaje del asistente deja claro que es una IA.
- [ ] Las tres sugerencias del chat llevan a «Esto entendí» y después a la pantalla Ruta.
- [ ] Un texto libre no previsto recibe una respuesta que pide los datos que faltan.
- [ ] «Esto entendí» separa lo que viene del mensaje de lo que viene de las preferencias.
- [ ] Un cambio pedido por chat se refleja en la ruta y se puede deshacer.
- [ ] Ninguna pantalla hace llamadas de red a un backend.
- [ ] Los tokens y componentes compartidos están disponibles para la spec 2 desde el inicio.

## Decisiones abiertas

Quedan a criterio del desarrollador, salvo las dos primeras, que conviene decidir con el otro desarrollador.

- Web responsive o PWA frente a app nativa.
- Forma final del contrato compartido.
- Librería de componentes o componentes propios.
- Cuántas frases de ejemplo reconoce el asistente simulado.
- Si las respuestas del asistente aparecen de golpe o letra a letra.
- Animación de la mascota.
- Pruebas automáticas y herramientas de calidad.
