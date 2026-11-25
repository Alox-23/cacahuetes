# Spec técnica 3 · Frontend: versión de escritorio

24 nov 2026

## Objetivo y alcance

Esta spec define cómo se adaptan a escritorio las 23 pantallas móviles ya diseñadas, sin cambiar los flujos ni añadir funciones. Sigue siendo solo frontend, con datos y asistente simulados.

- **Incluye:** puntos de corte, estructura de la ventana, adaptación de cada pantalla e interacción con teclado y ratón.
- **Queda fuera:** el contenido y la lógica de cada pantalla, que están en la [spec 1](spec-1-asistente-y-base.md) y la [spec 2](spec-2-ruta-mis-rutas-perfil.md).
- **No se implementa:** backend, IA real ni cálculo real de rutas.
- **Diseños:** hay siete pantallas de escritorio en `design/desktop/`, junto a los diseños móviles de referencia en `design/mobile/`.

Es una sola base de código: las mismas pantallas y componentes cambian de disposición según el ancho, sin una app de escritorio aparte.

## Puntos de corte y principios

Hay tres tramos de ancho; los valores son una propuesta.

| Tramo | Ancho | Disposición |
| --- | --- | --- |
| Móvil | Menos de 768 px | Los diseños actuales, sin cambios |
| Tableta | De 768 a 1.023 px | La disposición móvil centrada, con un ancho máximo de 560 px |
| Escritorio | 1.024 px o más | La estructura de esta spec, con un ancho máximo de contenido de 1.440 px |

Cinco principios guían la adaptación:

- **El chat sigue siendo el centro:** en escritorio el asistente queda siempre visible, junto a la ruta.
- **Dos cosas a la vez:** lo que en móvil son dos pantallas seguidas (chat y ruta, lista y mapa) en escritorio se ve lado a lado.
- **Diálogos en lugar de pantallas completas:** los pasos cortos (crear cuenta, valorar, cambiar parada) se abren como diálogo o panel lateral.
- **Ancho de lectura limitado:** formularios y textos no pasan de 720 px, aunque la ventana sea más ancha.
- **La regla del pulgar no aplica:** en escritorio el botón principal va al final de su bloque de contenido, no anclado al borde inferior de la ventana.

## Estructura general

En escritorio la ventana tiene una barra lateral, el chat y, solo cuando hay algo que mostrar, un panel derecho. El chat se ve siempre, en todas las secciones.

| Zona | Ancho propuesto | Contenido |
| --- | --- | --- |
| Barra lateral | 240 px | Mascota y nombre de la app, Asistente, Mis rutas (menú desplegable con las rutas guardadas), Perfil y el acceso a la cuenta. Sustituye a la barra de pestañas inferior |
| Chat | Todo el espacio libre si no hay panel; de 400 a 480 px si lo hay | La conversación con Cacahuete. Con todo el ancho, los mensajes se centran en una columna de 680 px como máximo, y las burbujas de ambos lados son anchas para que se solapen en horizontal |
| Panel derecho | El espacio restante | La ruta terminada, una ruta guardada o los ajustes de Perfil |

El panel derecho sigue estas reglas:

1. **Sin ruta todavía** (preguntas iniciales, petición, «Esto entendí»): no hay panel y el chat ocupa todo el espacio libre.
2. **Mientras la IA crea la ruta:** sigue sin panel. El progreso se muestra como un mensaje dentro del chat.
3. **Ruta terminada:** el chat se estrecha y la ruta aparece a la derecha, con el mapa arriba y las paradas debajo.
4. **Mis rutas:** el elemento de la barra lateral se despliega y lista las rutas guardadas. Al elegir una, se abre en el panel derecho.
5. **Perfil:** los ajustes se muestran en el panel derecho, con el chat visible al lado.

Así, pedir un cambio por chat actualiza la ruta a la vista, sin navegar entre pantallas.

## Adaptación pantalla por pantalla

Cada pantalla móvil tiene un destino en escritorio; ninguna desaparece.

| Pantalla móvil | En escritorio |
| --- | --- |
| Inicio | Página de dos columnas, sin barra lateral: mensaje y botón a la izquierda, ruta de ejemplo a la derecha |
| Preguntas iniciales 1 a 4 | Dentro del chat, que ocupa todo el espacio libre |
| Chat principal | Columna de chat, con las preferencias guardadas en una franja superior plegable |
| Petición y aclaración | Columna de chat, sin cambios de contenido |
| Esto entendí | Tarjeta dentro del chat, como en móvil |
| Creando la ruta | Mensaje de progreso dentro del chat, que sigue a todo el ancho; el panel derecho aún no aparece |
| Ruta | Panel de contexto: mapa arriba, paradas debajo. Los botones rápidos van sobre la lista |
| Cambio por chat | Se funde con la vista anterior: el mensaje aparece en el chat y la ruta se actualiza al lado |
| Detalle de lugar | Panel lateral que se desliza sobre la lista de paradas, con el mapa aún visible |
| Cambiar parada | Lista desplegable junto a la parada, o diálogo pequeño |
| Guardar como invitado, Crear cuenta, Entrar | Diálogo centrado de unos 440 px de ancho, sobre la pantalla actual |
| Mis rutas | Menú desplegable bajo «Mis rutas» en la barra lateral, con las rutas guardadas |
| Mis rutas, estado vacío | Texto «Aún no tienes rutas» dentro del desplegable |
| Ruta guardada | Al elegirla en el desplegable se abre en el panel derecho, junto al chat |
| Valorar ruta | Diálogo centrado |
| Perfil, Preferencias, Cuenta | Ajustes en el panel derecho, con pestañas arriba y 720 px de ancho como máximo; el chat sigue visible |

## Interacción de escritorio

Escritorio añade teclado y ratón; ninguna acción debe depender solo del tacto.

- **Enviar mensajes:** Intro envía y Mayús + Intro hace salto de línea. El campo de texto recibe el foco al abrir Asistente.
- **Teclado completo:** todas las acciones se alcanzan con Tab, con un indicador de foco visible, y las opciones se eligen con Espacio o Intro.
- **Diálogos:** atrapan el foco mientras están abiertos, se cierran con Esc y devuelven el foco al elemento que los abrió.
- **Estados de ratón:** botones, tarjetas, chips y paradas tienen estado al pasar el cursor, con el marrón oscuro `#2A1A0E` de la paleta.
- **Mapa y lista enlazados:** pasar el cursor por una parada la resalta en el mapa, y al revés. Al hacer clic se abre el detalle del lugar.
- **Reordenar paradas:** arrastrar con el ratón, con una alternativa por teclado o botones de subir y bajar.
- **Desplazamiento:** el chat y la lista de paradas se desplazan por separado; la barra lateral y el mapa quedan fijos.
- **Cambio de tamaño:** al estrechar la ventana por debajo de 1.024 px se pasa a la disposición móvil sin perder la conversación ni la ruta.

## Reparto con las specs 1 y 2

La versión de escritorio no necesita un tercer bloque de pantallas: cada desarrollador adapta las suyas, y uno de los dos es responsable de la estructura común.

| Pieza | Responsable propuesto |
| --- | --- |
| Estructura de la ventana, barra lateral y puntos de corte | Spec 1, que ya lleva la base de la app |
| Columna de chat, Inicio y preguntas iniciales en escritorio | Spec 1 |
| Panel de contexto: ruta, mapa, detalle de lugar y cambiar parada | Spec 2 |
| Diálogos de cuenta y de valorar, Mis rutas y página de ajustes | Spec 2 |
| Componente de diálogo y de panel lateral, compartidos | Spec 1 |

Si la versión de escritorio la hace una tercera persona, este reparto pasa a ser una lista de qué tocar en cada mitad. El contrato compartido de tipos y funciones no cambia.

## Pendiente de diseñar

Hay siete pantallas de escritorio diseñadas. Faltan, por orden de prioridad:

1. Diálogos de entrar y de valorar.
2. Las preguntas iniciales 2 a 4 y la tarjeta «Esto entendí» en el chat a todo el ancho.
3. Mis rutas desplegado cuando no hay rutas guardadas.
4. Detalle de lugar y cambiar parada dentro del panel derecho.
5. Pestañas de datos personales y de cuenta en Perfil.
6. Estados de error y de carga.
7. Barra lateral plegada y tramo de tableta.

## Criterios de aceptación

- [ ] A 1.024 px o más aparece la barra lateral y desaparece la barra de pestañas inferior.
- [ ] En Asistente, el chat y la ruta se ven a la vez, y un cambio pedido por chat actualiza la ruta sin navegar.
- [ ] Mientras no hay una ruta terminada, el chat ocupa todo el espacio libre; el panel derecho aparece al terminar la ruta.
- [ ] Crear cuenta, entrar, guardar como invitado y valorar se abren como diálogo y se cierran con Esc.
- [ ] «Mis rutas» despliega las rutas guardadas en la barra lateral, y al elegir una se abre a la derecha.
- [ ] El chat se ve en todas las secciones, también en Mis rutas y en Perfil.
- [ ] Todas las acciones se pueden hacer solo con teclado, con el foco siempre visible.
- [ ] Pasar el cursor por una parada la resalta en el mapa.
- [ ] La app funciona a 1.024, 1.280, 1.440 y 1.920 px de ancho sin desplazamiento horizontal.
- [ ] Al estrechar la ventana por debajo de 1.024 px se conserva la conversación y la ruta.
- [ ] Por debajo de 768 px la app es idéntica a los diseños móviles.

## Decisiones abiertas

Quedan a criterio de los desarrolladores, salvo las dos primeras, que conviene decidir antes de empezar.

- Quién hace la versión de escritorio: los dos desarrolladores, cada uno su mitad, o una tercera persona.
- Si se diseñan las pantallas de escritorio que faltan antes de implementar, o se implementan a partir de esta spec.
- Valores exactos de los puntos de corte y de los anchos de cada zona.
- Si el tramo de tableta merece una disposición propia de dos columnas.
- Si la barra lateral empieza abierta o plegada.
- Si la división entre el chat y el panel de ruta se puede arrastrar para cambiar su ancho.
- Atajos de teclado adicionales.
