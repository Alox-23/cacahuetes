# Spec técnica 4 · Frontend: interfaz de chat

24 nov 2026

## Objetivo y alcance

Esta spec define el componente de chat con Cacahuete, que es el mismo en móvil y en escritorio y aparece en todas las secciones de la app. Sigue siendo solo frontend, con el asistente simulado.

- **Incluye:** estructura del chat, burbujas, tipos de mensaje, campo de texto, comportamiento y accesibilidad.
- **Queda fuera:** el guion del asistente y las pantallas, que están en la [spec 1](spec-1-asistente-y-base.md), y la disposición de escritorio, que está en la [spec 3](spec-3-version-de-escritorio.md).
- **Responsable propuesto:** el desarrollador de la spec 1, como parte de los componentes compartidos.
- **Referencia visual:** las pantallas de chat de `design/desktop/` y `design/mobile/`.

Las medidas de esta spec son las de los diseños actuales.

## Estructura del chat

El chat tiene tres partes fijas, de arriba abajo.

| Parte | Contenido | Medidas |
| --- | --- | --- |
| Cabecera | Avatar de Cacahuete, nombre y «Asistente de IA». En móvil, también la flecha de volver o «Omitir» | 44 px de alto en móvil, 72 px en escritorio |
| Conversación | Los mensajes, anclados abajo | Ocupa el espacio restante; márgenes laterales de 20 px |
| Campo de texto | Entrada de texto y botón redondo de enviar | Entrada de 48 px de alto y radio 24; botón de 48 px |

El ancho del chat depende de dónde esté:

- **Móvil:** todo el ancho de la pantalla.
- **Escritorio sin panel derecho:** todo el espacio libre, con la conversación centrada en una columna de 680 px como máximo.
- **Escritorio con panel derecho:** una columna de 400 a 480 px.

## Burbujas

Las burbujas de los dos lados son anchas a propósito: cada una invade la mitad contraria, de modo que la conversación se lee en zigzag y no como dos columnas separadas.

| Propiedad | Asistente (izquierda) | Usuario (derecha) |
| --- | --- | --- |
| Ancho máximo | 100 % de la conversación, con tope de 520 px | 80 % de la conversación, con tope de 460 px |
| Fondo | Blanco `#FFFFFF` | Marrón `#4A2F1B` |
| Texto | Marrón `#4A2F1B` | Blanco `#FFFFFF` |
| Borde | 2 px color cáscara `#E9C48A` | Sin borde |
| Radio | 22 px, con la esquina inferior izquierda en 6 px | 22 px, con la esquina inferior derecha en 6 px |
| Relleno | 14 px arriba y abajo, 18 px a los lados | 12 px arriba y abajo, 18 px a los lados |
| Etiqueta | Avatar de 20 px y «Cacahuete · IA» en `#7A4E22`, 13 px seminegrita | Sin etiqueta |

Comunes a las dos:

- **Tipografía:** 15 px con interlineado 1,45.
- **Sombra:** `0 1px 3px rgba(74, 47, 27, 0.18)`.
- **Separación:** 10 px entre mensajes consecutivos.
- **Alineación:** cada burbuja se ajusta a su contenido y se pega a su lado; nunca se estira al ancho completo salvo que el contenido lo pida.
- **Solape:** con una conversación de 640 px, la burbuja del asistente llega hasta 520 px desde la izquierda y la del usuario empieza a 180 px, así que comparten 340 px.

## Tipos de mensaje del asistente

El usuario solo envía texto o la opción que toca. El asistente tiene seis tipos de mensaje, todos dentro de su burbuja.

| Tipo | Contenido | Dónde se usa |
| --- | --- | --- |
| Texto | Uno o varios párrafos | Saludo, confirmaciones |
| Pregunta de una opción | Texto y respuestas rápidas; al tocar una, se envía | Compañía, presupuesto, dato que falta |
| Pregunta de varias opciones | Texto, opciones seleccionables y botón «Listo» | Intereses, ritmo y transporte |
| Esto entendí | Título, chips «De tu mensaje», chips «De tus preferencias» con enlace «Cambiar», y botón «Crear ruta» | Antes de crear la ruta |
| Progreso | «Estoy creando tu ruta» y lista de pasos con estado hecho, en curso o pendiente | Mientras se crea la ruta |
| Cambio | Lista de lo que cambió y acción «Deshacer»; en móvil, también «Ver ruta actualizada» | Tras pedir un cambio |

Reglas de las opciones:

- **Respuestas rápidas:** píldoras de 44 px de alto con borde marrón, en filas que saltan de línea.
- **Opciones seleccionadas:** fondo dorado `#F4AE52` con borde marrón de 2 px.
- **Respuesta registrada:** al elegir, la respuesta aparece como burbuja del usuario y las opciones de esa pregunta dejan de poder tocarse.
- **Texto libre siempre disponible:** cualquier pregunta se puede contestar escribiendo.

## Comportamiento

Salvo el anclaje, que ya está en los diseños, estas reglas son una propuesta.

- **Anclaje abajo:** los mensajes se apilan desde el borde inferior, junto al campo de texto. Con pocos mensajes, el hueco queda arriba.
- **Desplazamiento:** al llegar un mensaje nuevo, la conversación baja hasta él. Si el usuario ha subido a leer mensajes anteriores, no se le mueve y aparece un aviso de «mensaje nuevo».
- **Escribiendo:** antes de cada respuesta del asistente se muestra su burbuja con un indicador de escritura.
- **Enviar:** el botón de enviar se desactiva con el campo vacío. En escritorio, Intro envía y Mayús + Intro hace salto de línea.
- **Campo de texto:** crece hasta cuatro líneas y después se desplaza por dentro.
- **Persistencia:** la conversación se conserva al cambiar de sección, al cambiar el ancho de la ventana y al recargar.
- **Cambio de ancho:** cuando aparece o desaparece el panel derecho, el chat cambia de ancho con una transición corta y mantiene la posición de lectura.
- **Teclado en móvil:** al abrirse el teclado, el campo de texto y el último mensaje siguen visibles.

## Accesibilidad

- **Anuncio de mensajes:** la conversación es una región que los lectores de pantalla anuncian al llegar un mensaje nuevo, indicando quién habla.
- **Autoría sin depender del color:** cada mensaje del asistente lleva su etiqueta de texto, y los del usuario un nombre accesible equivalente.
- **Opciones:** son botones reales, con estado seleccionado expuesto, y se recorren con Tab.
- **Campo de texto:** tiene etiqueta, aunque no sea visible.
- **Tamaños:** objetivos táctiles de 44 px como mínimo.
- **Contraste:** texto marrón sobre blanco y blanco sobre marrón cumplen 4,5:1; el borde color cáscara es decorativo.
- **Movimiento:** el indicador de escritura y las transiciones respetan la preferencia de movimiento reducido.

## Criterios de aceptación

- [ ] Las burbujas coinciden con las medidas de esta spec en móvil y en escritorio.
- [ ] En una conversación de 640 px o más, una burbuja larga del asistente y una larga del usuario se solapan en horizontal.
- [ ] Ninguna burbuja del usuario supera el 80 % del ancho de la conversación.
- [ ] Los mensajes se anclan abajo y el más reciente queda siempre visible al enviarse.
- [ ] Los seis tipos de mensaje del asistente se muestran dentro de su burbuja.
- [ ] Al elegir una opción, la respuesta aparece como burbuja del usuario.
- [ ] El mismo componente se usa en móvil, en escritorio a todo el ancho y en escritorio con panel derecho.
- [ ] La conversación se conserva al cambiar de sección y al cambiar el ancho de la ventana.
- [ ] Un lector de pantalla anuncia cada mensaje nuevo y quién lo envía.

## Decisiones abiertas

- Si las burbujas llevan una punta dibujada, como en la referencia, o basta la esquina en 6 px.
- Si se agrupan los mensajes seguidos de un mismo autor, con menos separación y una sola etiqueta.
- Si se muestra la hora de cada mensaje.
- Forma del indicador de escritura y duración de la espera simulada.
- Si el texto del asistente aparece de golpe o letra a letra.
- Cuántos mensajes se conservan en el historial local.
- Si el usuario puede editar o reenviar su último mensaje.
