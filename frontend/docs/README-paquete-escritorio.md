> **Nota de integración en este repo:** el paquete se ha copiado en `frontend/docs/` conservando la estructura que ya existía. `design/mobile/` del paquete es aquí `design/screens/`, y `specs/referencia/` es aquí `specs/` (specs 1 y 2). El plan de implementación está en `tech-specs/feature-3-version-de-escritorio.md`.

# App de rutas turísticas · paquete de la versión de escritorio

Paquete para implementar la versión de escritorio del frontend de una app, en español, donde el usuario pide rutas turísticas personalizadas conversando con un asistente de IA con forma de cacahuete.

**Alcance: solo frontend.** No hay backend, ni IA real, ni cálculo real de rutas. El asistente es un guion en el cliente y los datos son de ejemplo.

Este paquete es autosuficiente: incluye como referencia las specs y los diseños móviles de los que parte.

## Para el agente de código

1. Lee este archivo entero.
2. Lee `specs/spec-3-version-de-escritorio.md`: es la spec principal de este paquete.
3. Lee `specs/spec-4-interfaz-de-chat.md`: define el componente de chat, que en escritorio está siempre visible.
4. Consulta `specs/referencia/` para el contenido y la lógica de cada pantalla (specs 1 y 2).
5. Abre los diseños de `design/desktop/` como referencia visual: son HTML estático con estilos en línea.
6. Usa `design/tokens.json` para colores, tipografías, radios y espaciados; no copies valores sueltos de los HTML.
7. Usa `contract/types.ts` como interfaz de datos.

Es una sola base de código responsiva. Si la versión móvil ya existe, la de escritorio se añade sobre ella con puntos de corte, no como una app aparte.

## Contenido

| Ruta | Qué es |
| --- | --- |
| `specs/spec-3-version-de-escritorio.md` | Puntos de corte, estructura de la ventana, adaptación por pantalla e interacción |
| `specs/spec-4-interfaz-de-chat.md` | Componente de chat: burbujas, tipos de mensaje, comportamiento y accesibilidad |
| `specs/referencia/` | Specs 1 y 2 de la versión móvil, para el contenido de cada pantalla |
| `design/desktop/README.md` | Índice de las 7 pantallas de escritorio |
| `design/desktop/*.html` | Pantallas de escritorio, pensadas para 1440 × 900 px |
| `design/mobile/*.html` | Las 23 pantallas móviles de referencia, de 390 × 844 px |
| `design/tokens.json` | Tokens de diseño, con la sección `desktop` |
| `design/flows.md` | Flujos de usuario de la versión móvil |
| `design/mascot/cacahuete.svg` | Avatar del asistente |
| `contract/types.ts` | Tipos y funciones compartidos (propuesta) |

## Las tres reglas de escritorio

- **El chat se ve siempre.** Está en todas las secciones: Asistente, Mis rutas y Perfil.
- **El panel derecho aparece solo cuando hay algo que mostrar.** Sin ruta, y mientras la IA la crea, el chat ocupa todo el espacio libre. Al terminar la ruta, el chat se estrecha y la ruta aparece a la derecha.
- **Mis rutas es un menú desplegable de la barra lateral.** Lista las rutas guardadas; al elegir una, se abre en el panel derecho.

## Reglas generales que siguen vigentes

- **Sin backend:** ninguna llamada de red a un servidor propio. Estado en memoria y almacenamiento local.
- **Preguntas una sola vez:** las cuatro preguntas iniciales se hacen dentro del chat, con opciones para elegir, y no se repiten.
- **IA visible desde el inicio:** el asistente se presenta como IA en su primer mensaje.
- **Sin registro obligatorio:** la cuenta se pide al guardar una ruta, en un diálogo.
- **Burbujas solapadas:** las burbujas de los dos lados son anchas y se solapan en horizontal (spec 4).
- **Idioma:** español, con los textos en archivos de traducción.
- **Accesibilidad:** todo se puede hacer con teclado, con foco visible y contraste de texto de 4,5:1.

En escritorio no aplica la regla móvil de agrupar los controles en la zona del pulgar.

## Lo que es provisional

- El nombre de la app aparece como `[NOMBRE APP]`, y el usuario como `[NOMBRE]` y `[CORREO]`.
- «Cacahuete» es un nombre de trabajo para el asistente, y su dibujo es un boceto.
- Rutas, fechas, horarios y tiempos de los diseños son datos de ejemplo.
- Los anchos y puntos de corte de la spec 3 son una propuesta.
- React con TypeScript es una propuesta de stack, no una decisión cerrada.

## Sobre los diseños HTML

- Las pantallas de escritorio son fluidas: se ven como en el diseño con la ventana a 1440 px de ancho.
- Los enlaces entre archivos reproducen la navegación prevista.
- Los controles no tienen lógica: los estados seleccionados y el desplegable abierto son fijos.
- Cargan las tipografías de Google Fonts; sin conexión se ve una tipografía del sistema.
- No se han revisado renderizados uno a uno: si un detalle de espaciado contradice una spec, manda la spec.

## Lo que falta

Solo hay siete pantallas de escritorio diseñadas. La spec 3 lista las que faltan y explica en texto cómo se adapta cada pantalla móvil; las decisiones abiertas están al final de cada spec.
