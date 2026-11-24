# Spec técnica 2 · Frontend: ruta, mis rutas y perfil

24 nov 2026

## Objetivo y alcance

Esta spec cubre la mitad «ruta y cuenta» del frontend: la pantalla de ruta con su mapa, Mis rutas, el registro y el perfil. No hay backend: todo funciona con datos simulados en el cliente.

- **Incluye:** 13 pantallas, el mapa y el módulo de datos simulados que usan los dos desarrolladores.
- **Queda fuera:** la base de la app y las pantallas de chat con el asistente, que están en la [spec 1](spec-1-asistente-y-base.md).
- **No se implementa:** backend, IA real ni cálculo real de rutas.
- **Referencias:** [diseños de las pantallas](../design/screens/README.md) y [flujos](../design/flows.md).

Esta spec fija lo ya decidido. Todo lo demás lo decide y añade el desarrollador.

## Reparto entre los dos desarrolladores

Cada desarrollador es responsable de un bloque de pantallas y de una pieza compartida.

| Área | Spec 1 | Spec 2 (esta) |
| --- | --- | --- |
| Base del proyecto, tokens de diseño, componentes compartidos, barra de pestañas | Responsable | La usa |
| Inicio, preguntas iniciales y todas las pantallas de chat | Responsable |  |
| Guion del asistente simulado | Responsable |  |
| Ruta, mapa, detalle de lugar, cambiar parada |  | Responsable |
| Crear cuenta, entrar, guardar como invitado |  | Responsable |
| Mis rutas, valorar, perfil, preferencias, cuenta |  | Responsable |
| Módulo de datos simulados (preferencias, rutas, lugares, sesión) | Lo usa | Responsable |

El punto de unión es el contrato compartido de tipos y funciones, descrito en la spec 1. Conviene acordarlo entre los dos el primer día.

## Pantallas de esta spec

Son trece pantallas, todas diseñadas.

| Grupo | Pantalla | Archivo de diseño | Qué hace |
| --- | --- | --- | --- |
| Ruta | Ruta | `Ruta.html` | Mapa, paradas con horarios y trayectos, botones rápidos, «Pide un cambio», guardar y compartir |
| Ruta | Detalle de lugar | `Lugar.html` | Foto, por qué se eligió, horario, precio; cambiar, quitar o fijar |
| Ruta | Cambiar parada | `CambiarParada.html` | Tres alternativas equivalentes y «Usar esta parada» |
| Ruta | Guardar como invitado | `GuardarInvitado.html` | Pide crear cuenta o entrar, con «Seguir sin guardar» |
| Cuenta | Crear cuenta | `Registro.html` | Correo y contraseña, Google y Apple, aceptación de términos |
| Cuenta | Entrar | `Login.html` | Correo y contraseña, Google y Apple, enlace de contraseña olvidada |
| Mis rutas | Lista | `MisRutas.html` | Buscador, pestañas Próximas, Pasadas y Favoritas, tarjetas de ruta |
| Mis rutas | Estado vacío | `MisRutasVacio.html` | Mensaje y botón para pedir la primera ruta al asistente |
| Mis rutas | Ruta guardada | `RutaGuardada.html` | Mapa, paradas, reutilizar, compartir, valorar, empezar y eliminar |
| Mis rutas | Valorar ruta | `Valorar.html` | Estrellas, me gusta o no por parada y comentario opcional |
| Perfil | Perfil | `Perfil.html` | Datos del usuario, accesos a preferencias y cuenta, cerrar sesión |
| Perfil | Preferencias de viaje | `Preferencias.html` | Intereses, ritmo, transporte, compañía y presupuesto |
| Perfil | Cuenta | `Cuenta.html` | Nombre, correo, contraseña, idioma, avisos y eliminar cuenta |

## Flujos

Cinco flujos pasan por estas pantallas.

1. **Ver y refinar la ruta:** la ruta llega creada desde el chat. Se refina con los botones rápidos (menos caminar, más comida, más barato, añadir pausa) o por parada: ver detalle, cambiar, quitar o fijar. Cada cambio se puede deshacer.
2. **Guardar:** con cuenta, la ruta va a Mis rutas. Un invitado pasa por «Guardar como invitado», crea cuenta o entra, y conserva la ruta y las preferencias.
3. **Mis rutas:** abrir una ruta guardada, reutilizarla (vuelve a «Esto entendí», de la spec 1), compartirla, marcarla como favorita o eliminarla.
4. **Valorar:** desde una ruta pasada, estrellas para la ruta y me gusta o no por parada.
5. **Perfil:** editar las preferencias de viaje y los datos de la cuenta. El cambio de preferencias se refleja en el chat principal.

## Datos simulados

Sin backend, un módulo de datos en el cliente sirve a las dos mitades de la app. Este desarrollador es su responsable.

- **Contenido de ejemplo:** una ciudad (Barcelona, la de los diseños), una lista corta de lugares y tres rutas guardadas.
- **Crear ruta:** devuelve una ruta preparada según la petición. No hay cálculo real.
- **Refinar:** cada botón rápido y cada acción por parada aplica un cambio preparado y crea una versión nueva, para poder deshacer.
- **Alternativas:** tres lugares preparados por parada.
- **Cuenta simulada:** crear cuenta y entrar funcionan sin validación real. Al pasar de invitado a cuenta se conservan la ruta y las preferencias.
- **Persistencia:** almacenamiento local del navegador, con arranque correcto si está vacío.
- **Datos sin fuente:** horarios y precios de los lugares se muestran como marcadores, igual que en los diseños.
- **Sustituible:** las pantallas solo llaman a las funciones del contrato, para cambiar el módulo por una API real más adelante.

Los tipos y la lista de funciones están en la sección «Contrato compartido» de la [spec 1](spec-1-asistente-y-base.md) y en `contract/types.ts`.

## Reglas de UX y mapa

Los tokens, los componentes y la paleta vienen de la spec 1; aquí van las reglas propias de estas pantallas.

- **Zona del pulgar:** opciones, campos y botón principal van agrupados abajo, con el título arriba y sin hueco vacío bajo el contenido.
- **Mapa:** librería a elegir. Línea de ruta en naranja `#D4621A`, paradas numeradas en dorado `#F4AE52` y punto de salida diferenciado.
- **Ruta:** el mapa ocupa la parte superior y la lista de paradas va en una hoja inferior, con guardar y compartir siempre visibles abajo.
- **Formularios:** etiquetas visibles, errores junto al campo y teclado adecuado para correo y contraseña.
- **Accesibilidad:** objetivos táctiles de 44 px como mínimo y contraste de texto de 4,5:1.
- **Acciones destructivas:** eliminar ruta y eliminar cuenta en rojo y con confirmación.

## Pantallas pendientes de diseñar

Estas pantallas y estados de esta mitad aún no tienen diseño.

- Recuperar contraseña y verificación de correo.
- Permiso de ubicación, y qué ocurre si se rechaza.
- Compartir ruta, y la vista pública que ve quien recibe el enlace.
- Confirmaciones de eliminar ruta, eliminar cuenta y cerrar sesión.
- Ruta en curso: parada actual, cómo llegar a la siguiente, «llegué», «saltar» y «voy con retraso».
- Fin de ruta, que enlaza con la valoración.
- Añadir una parada a mano.
- Notificaciones, ayuda y contacto.
- Términos y política de privacidad.
- Versión de escritorio, con mapa y lista lado a lado.

## Criterios de aceptación

- [ ] Las trece pantallas coinciden con los diseños a 390 px de ancho y funcionan a 360 px.
- [ ] El botón principal de cada pantalla queda en el tercio inferior.
- [ ] Una ruta creada desde el chat se abre en Ruta con mapa, paradas y horarios.
- [ ] Cada botón rápido y cada acción por parada cambia la ruta, y el cambio se puede deshacer.
- [ ] Un invitado que guarda una ruta pasa por crear cuenta y la encuentra después en Mis rutas.
- [ ] Las preferencias editadas en Perfil aparecen actualizadas en el chat principal.
- [ ] Mis rutas muestra el estado vacío cuando no hay rutas guardadas.
- [ ] Los datos se conservan al recargar la app.
- [ ] Ninguna pantalla hace llamadas de red a un backend.
- [ ] Las pantallas acceden a los datos solo a través de las funciones del contrato.

## Decisiones abiertas

Quedan a criterio del desarrollador, salvo las dos primeras, que conviene decidir con el otro desarrollador.

- Web responsive o PWA frente a app nativa.
- Forma final del contrato compartido.
- Librería de mapas, y si el mapa de ejemplo usa datos reales o una imagen fija.
- Cómo se comparte una ruta sin backend (por ejemplo, copiar un texto resumen).
- Qué hace «Empezar ruta» mientras no exista la pantalla de ruta en curso.
- Cuántos lugares y rutas de ejemplo incluir.
- Pruebas automáticas y herramientas de calidad.
