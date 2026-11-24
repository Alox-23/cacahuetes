# App de rutas turísticas · paquete de frontend

Paquete para implementar el frontend de una app móvil, en español, donde el usuario pide rutas turísticas personalizadas conversando con un asistente de IA con forma de cacahuete.

**Alcance: solo frontend.** No hay backend, ni IA real, ni cálculo real de rutas. El asistente es un guion en el cliente y los datos son de ejemplo.

## Para el agente de código

1. Lee este archivo entero.
2. Lee la spec que te corresponde (1 o 2). Si implementas toda la app, lee las dos, empezando por la 1.
3. Abre los diseños de `design/screens/` como referencia visual exacta: son HTML estático con estilos en línea.
4. Usa `design/tokens.json` para colores, tipografías, radios y espaciados; no copies valores sueltos de los HTML.
5. Usa `contract/types.ts` como interfaz entre las dos mitades.

## Contenido

| Ruta | Qué es |
| --- | --- |
| `specs/spec-1-asistente-y-base.md` | Base de la app, sistema visual, 10 pantallas de chat y asistente simulado |
| `specs/spec-2-ruta-mis-rutas-perfil.md` | 13 pantallas de ruta, cuenta, Mis rutas y perfil, mapa y datos simulados |
| `contract/types.ts` | Tipos y funciones compartidos entre las dos mitades (propuesta) |
| `design/tokens.json` | Tokens de diseño |
| `design/flows.md` | Flujos de usuario y mapa de navegación |
| `design/screens/README.md` | Índice de las 23 pantallas: archivo, nombre, spec y enlaces |
| `design/screens/*.html` | Una pantalla por archivo, 390 × 844 px |
| `design/mascot/cacahuete.svg` | Avatar del asistente |

## Reglas que no se pueden saltar

- **Sin backend:** ninguna llamada de red a un servidor propio. Estado en memoria y almacenamiento local.
- **El chat es el centro:** cada ruta se pide y se cambia hablando con el asistente.
- **Preguntas una sola vez:** las cuatro preguntas iniciales se hacen dentro del chat, con opciones para tocar, y no se repiten. Las preferencias se pueden cambiar después.
- **IA visible desde el inicio:** el asistente se presenta como IA en su primer mensaje.
- **Sin registro obligatorio:** un invitado puede crear rutas; la cuenta se pide al guardar.
- **Zona del pulgar:** controles y botón principal agrupados abajo, sin hueco vacío bajo el contenido.
- **Idioma:** español, con los textos en archivos de traducción.
- **Accesibilidad:** objetivos táctiles de 44 px como mínimo y contraste de texto de 4,5:1.

## Lo que es provisional

- El nombre de la app aparece como `[NOMBRE APP]`, y el usuario como `[NOMBRE]` y `[CORREO]`.
- «Cacahuete» es un nombre de trabajo para el asistente, y su dibujo es un boceto.
- Rutas, fechas, horarios y tiempos de los diseños son datos de ejemplo.
- Horarios y precios de lugares aparecen como `[HORARIO]` y `[PRECIO]`.
- React con TypeScript es una propuesta de stack, no una decisión cerrada.
- Los botones de Google y Apple van solo con texto, sin logotipos.

## Sobre los diseños HTML

- Cada archivo es una pantalla fija de 390 × 844 px, centrada en la página.
- Los enlaces entre archivos reproducen la navegación prevista.
- Los controles no tienen lógica: los estados seleccionados son fijos.
- Cargan las tipografías de Google Fonts; sin conexión se ve una tipografía del sistema.
- No se han revisado renderizados uno a uno: si un detalle de espaciado contradice una regla de este archivo, manda la regla.

## Lo que falta

Cada spec termina con dos listas: las pantallas aún sin diseño y las decisiones abiertas. El desarrollador decide qué añadir.
