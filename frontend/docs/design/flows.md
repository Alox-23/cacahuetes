# Flujos de usuario

La app tiene tres pestañas inferiores: **Asistente**, **Mis rutas** y **Perfil**. Los nombres de archivo remiten a `design/screens/`.

## 1. Primera vez (sin registro)

1. `Main` · Inicio: el usuario toca «Planificar mi ruta».
2. `ChatInicio1` a `ChatInicio4` · el asistente se presenta como IA y hace cuatro preguntas con opciones para tocar: intereses, ritmo y transporte, compañía, presupuesto.
3. `Chat` · chat principal, con las preferencias ya guardadas.

Las cuatro preguntas se hacen una sola vez. «Omitir» salta al chat principal con valores por defecto.

## 2. Pedir una ruta

1. `Chat` · el usuario escribe la petición o toca una sugerencia.
2. `ChatPeticion` · si falta ciudad, fecha, tiempo o punto de salida, el asistente pregunta solo ese dato, con respuestas rápidas.
3. `ChatResumen` · tarjeta «Esto es lo que entendí», con lo que viene del mensaje y lo que viene de las preferencias. Botón «Crear ruta».
4. `Cargando` · progreso mientras se prepara la ruta.
5. `Ruta` · mapa y paradas.

## 3. Refinar la ruta

- **Botones rápidos en `Ruta`:** menos caminar, más comida, más barato, añadir pausa.
- **Por parada:** tocar una parada abre `Lugar`; desde ahí, cambiar (`CambiarParada`, tres alternativas), quitar o fijar.
- **Por chat:** «Pide un cambio al asistente» abre `ChatCambio`, donde el asistente explica qué cambió y ofrece «Ver ruta actualizada» o «Deshacer».

Cada cambio crea una versión nueva de la ruta y se puede deshacer.

## 4. Guardar

- **Con cuenta:** «Guardar ruta» la añade a `MisRutas`.
- **Invitado:** «Guardar ruta» abre `GuardarInvitado`, que lleva a `Registro` o `Login`. La ruta y las preferencias se conservan al crear la cuenta. «Seguir sin guardar» vuelve a `Ruta`.

## 5. Mis rutas

1. `MisRutas` · lista con buscador y pestañas Próximas, Pasadas y Favoritas. Sin rutas se muestra `MisRutasVacio`.
2. `RutaGuardada` · ver la ruta y elegir: empezar, reutilizar (vuelve a `ChatResumen`), compartir, valorar o eliminar.
3. `Valorar` · estrellas para la ruta, me gusta o no por parada y comentario opcional.

## 6. Perfil y preferencias

- `Perfil` · datos del usuario y accesos.
- `Preferencias` · intereses, ritmo, transporte, compañía y presupuesto. También se llega desde el enlace «Cambiar» del chat.
- `Cuenta` · nombre, correo, contraseña, idioma, avisos y eliminar cuenta.

Un cambio de preferencias se refleja en el chat principal. Una petición puntual en el chat («hoy quiero vida nocturna») vale solo para esa ruta.

## Mapa de navegación

```
Main ──► ChatInicio1 ► 2 ► 3 ► 4 ──► Chat ──► ChatPeticion ──► ChatResumen ──► Cargando ──► Ruta
  │                                   ▲  │                                                   │
  └─► Login ◄─► Registro              │  └─► Preferencias                                    ├─► Lugar ─► CambiarParada
                    ▲                 │                                                      ├─► ChatCambio
                    │                 │                                                      └─► GuardarInvitado ─► Registro / Login
Pestañas:  Asistente (Chat) · Mis rutas (MisRutas ─► RutaGuardada ─► Valorar) · Perfil (Perfil ─► Preferencias, Cuenta)
```
