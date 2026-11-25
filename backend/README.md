# Cacahuete en la intranet

Para el evento, usa el [lanzador de la raíz](../README.md). Sirve la web y la API en el mismo puerto, detecta la IPv4 de la intranet y usa la base de datos integrada por defecto. Si tienes un `backend/.env` antiguo con `APP_URL`, `PUBLIC_API_URL` o `FRONTEND_ORIGINS` fijados a localhost, quita esos valores para que los enlaces usen la dirección detectada.

### Instalación manual con PostgreSQL

Necesitas Node 22.13 o posterior de la serie 22, PostgreSQL local y Ollama. Prepara las dependencias y el modelo mientras tengas conexión. Desde la raíz, en PowerShell:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
$env:VITE_CACAHUETE_API_URL = '/api/cacahuete'
npm --prefix frontend run build
ollama pull qwen2.5:7b
ollama pull qwen2.5:3b
Copy-Item backend/.env.example backend/.env
```

Crea una base local vacía y configura en `backend/.env` su `DATABASE_URL` y un `QUOTA_SECRET` de al menos 32 caracteres. Para generar el secreto ejecuta `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Conserva el archivo únicamente en el portátil. Al servir la web compilada, el servidor detecta su origen a partir de las IPv4 del portátil. Usa el modo invitado durante el evento.

```powershell
npm --prefix backend run migrate
ollama list
npm --prefix backend run dev
```

Ollama debe estar abierto en el portátil. Si no está en la bandeja del sistema, ejecuta `ollama serve` en otra terminal. Se usan dos modelos cuantizados con soporte de español. Qwen2.5 3B (`OLLAMA_AGENT_MODEL`, descarga de 1,9 GB) decide qué acción del planificador ejecuta cada turno del chat y Qwen2.5 7B (`OLLAMA_MODEL`, descarga de 4,7 GB) redacta la respuesta. El planificador calcula siempre las paradas, los horarios y los precios. El consumo de RAM y la latencia dependen del contexto y del equipo. Antes de abrir al público, calienta los dos modelos con `ollama run qwen2.5:7b "Saluda en español"` y `ollama run qwen2.5:3b "Saluda en español"`, y comprueba con el portátil desconectado de internet que el chat crea una ruta y quita una parada. [Ficha de Qwen2.5 7B](https://ollama.com/library/qwen2.5:7b) · [Ficha de Qwen2.5 3B](https://ollama.com/library/qwen2.5:3b)

Node escucha en `0.0.0.0` y usa `PORT=3000` por defecto. En PowerShell **como administrador**, para una red del evento con perfil privado:

```powershell
New-NetFirewallRule -DisplayName "Cacahuete intranet" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

Desde un móvil conectado a la misma red abre la URL que aparece junto al adaptador Wi-Fi o Ethernet. Comprueba también `/api/cacahuete?action=health`. Si cambias `PORT`, ajusta la regla del firewall a ese puerto. La red debe permitir conexiones entre sus clientes. Solo Node necesita ser accesible desde los móviles.

El chat llama a `OLLAMA_BASE_URL` (por defecto `http://localhost:11434/v1`) con `OLLAMA_MODEL=qwen2.5:7b` para narrar y `OLLAMA_AGENT_MODEL=qwen2.5:3b` para decidir. La acción `agent` usa la API nativa `POST /api/chat` de Ollama en esa misma dirección, sin el `/v1` final. Admite 500 caracteres por mensaje y 20 peticiones al agente por minuto e IP. Si Ollama no responde a tiempo, usa la plantilla. Los límites se ajustan en `backend/.env` con números enteros positivos; un valor vacío o no válido mantiene el valor por defecto:

| Variable | Por defecto | Qué controla |
| --- | --- | --- |
| `OLLAMA_AGENT_MODEL` | `qwen2.5:3b` | Modelo que elige la acción del planificador en cada turno de `agent`. Su texto nunca se muestra al visitante |
| `OLLAMA_AGENT_TIMEOUT_MS` | `15000` | Tiempo máximo de cada llamada de decisión |
| `OLLAMA_TIMEOUT_MS` | `20000` | Tiempo máximo de cada generación del narrador |
| `OLLAMA_QUEUE_MS` | `30000` | Espera máxima en la cola cuando todas las plazas están ocupadas |
| `OLLAMA_CONCURRENCY` | `2` | Generaciones simultáneas. La cola y las plazas son comunes a los dos modelos |

**Portátil solo con CPU:** el modelo 7B necesita una GPU o un Mac con Apple Silicon para responder en menos de 20 s. Si la narración tarda demasiado, usa `OLLAMA_MODEL=qwen2.5:3b` y `OLLAMA_TIMEOUT_MS=45000`; así un único modelo decide y narra. Si es la decisión la que agota el tiempo, prueba `OLLAMA_AGENT_MODEL=qwen2.5:1.5b`. El lanzador descarga los modelos que falten; en la instalación manual, ejecuta antes `ollama pull` con el modelo elegido. `node backend/scripts/agent-smoke.mjs` ejecuta tres conversaciones contra el Ollama real e imprime la latencia de cada llamada; cada turno debe quedar por debajo de 45 s.

Cada vez que se usa la plantilla, la consola del servidor muestra `Cacahuete narrator fallback: <motivo>`, sin el mensaje ni la respuesta. Los motivos son `unreachable` (Ollama no responde), `timeout`, `http <estado>`, `length` (respuesta cortada), `empty`, `too-long` (más de seis frases), `invalid` (respuesta no JSON) y `queue` (espera agotada). La acción `agent` registra del mismo modo `Cacahuete agent fallback: <etapa> <motivo>`, también sin prompts ni texto del visitante. `/api/cacahuete?action=health` incluye `llm: { model, agentModel, reachable }`: `reachable` indica si Ollama contesta a `/api/tags` (se comprueba como mucho cada 30 s, con 1,5 s de límite) y nunca hace fallar la comprobación. Para comprobar el plan B, detén Ollama y vuelve a pedir una ruta: la respuesta llega con `source: "rules"`. Las pruebas se ejecutan con `npm --prefix backend test`.

**Truco de desarrollo:** la prueba gratuita de invitado (3 horas) va asociada a la IP, así que en tu propio equipo se agota y el chat responde `AGENT_TIME_EXPIRED`. Para reiniciarla, ejecuta `DELETE FROM guest_trials;` en la base de datos local.

Para mostrar fotos sin conexión, coloca fotos autorizadas en `frontend/public/places/<id-del-catálogo>.jpg` antes de compilar. También puedes incorporarlas a `frontend/dist/places/` después. La ficha muestra la mascota local si la foto falta o está dañada.

El mapa completo usa Leaflet para situar las paradas y unirlas sobre sus coordenadas. Para añadir un callejero sin conexión, coloca teselas XYZ de Marbella en `frontend/public/tiles/{z}/{x}/{y}.png` y define `VITE_LOCAL_TILE_URL=/tiles/{z}/{x}/{y}.png` antes de compilar. Por defecto Leaflet muestra el callejero local de Marbella obtenido del servicio WMS IGNBaseTodo del Instituto Geográfico Nacional (IGN), con las paradas y el recorrido encima.

## Contrato para el frontend

El adaptador HTTP implementa `frontend/src/contract/types.ts`. El chat conserva el cuestionario, las opciones y el resumen que el visitante confirma. Las peticiones de texto pasan por el intérprete de Cacahuete y las rutas se crean al confirmar. El único destino es Marbella. El chat propone puntos de salida del catálogo y acepta sus nombres o alias. Los horarios parten de ese lugar. La API devuelve HTTP 400 si la ciudad, la salida o un imprescindible quedan fuera del catálogo. Las rutas antiguas de otras ciudades se conservan en la base y quedan fuera de las consultas. Los tiempos de desplazamiento son estimaciones. Con la API configurada, el cuestionario se limita al perfil: después, el chat usa la acción `agent` y la ruta se crea sin resumen previo.

| Acción | Método | Entrada y resultado |
| --- | --- | --- |
| `getPreferences`, `savePreferences` | GET, PUT | Lectura de `Preferences` o `null`. La escritura recibe `Preferences` y devuelve 204. |
| `interpretRequest` | POST | Recibe `{text}` y devuelve preferencias para la visita y las pistas de duración y salida que reconoce. |
| `createRoute` | POST | Recibe un `RouteRequest` y devuelve un `Route` con estado 201. Los `overrides` afectan solo a esta visita. |
| `getRoute`, `listRoutes` | GET | Ruta por `id` o lista del propietario, con borradores y rutas guardadas. |
| `refineRoute`, `undo` | POST | Reciben `id` en la URL. La primera recibe un `RefineAction`. Ambas devuelven la versión resultante. |
| `refineConversation` | POST | Recibe `id` en la URL y `{version, changes}` con las opciones rápidas de un mensaje. Devuelve cada paso para describirlo en el chat y guarda el conjunto como un único cambio que se puede deshacer. |
| `saveRoute`, `deleteRoute` | POST, DELETE | Guardar exige sesión y devuelve la ruta. Eliminar devuelve 204. |
| `rateRoute` | PUT | Recibe `id` en la URL y `{stars, stops, comment?}` como cuerpo. Devuelve 204. |
| `getPlace`, `getAlternatives` | GET | La primera recibe el `id` del lugar. La segunda recibe el `id` de la ruta y el `order` de la parada. |
| `agent` | POST | Un turno de conversación libre: el modelo decide qué acción del planificador ejecutar y el narrador la explica. Ver [Agente conversacional](#agente-conversacional). |

El adaptador usa `status`, `login`, `register` y `logout` para la sesión. Cada navegador genera una credencial aleatoria de invitado y la envía en `X-Guest-Token`. Al entrar o registrarse se transfieren sus borradores a la cuenta. Las preferencias de una cuenta existente prevalecen sobre las del invitado. La cuota de invitado continúa asociada a la red. Una edición concurrente que pierda la carrera devuelve HTTP 409 y permite volver a cargar la ruta.

### Agente conversacional

Desde la feature 5, una vez creado el perfil, el visitante conversa libremente. En cada turno de `POST /api/cacahuete?action=agent`, el modelo de decisión (`OLLAMA_AGENT_MODEL`) elige qué herramienta del planificador llamar: crear la ruta, cambiar su franja horaria, añadir, quitar, sustituir o fijar una parada, aplicar un cambio rápido, deshacer, actualizar preferencias o solo contestar. El backend la ejecuta con el planificador determinista y el narrador (`OLLAMA_MODEL`) explica lo que ha pasado. El modelo nunca escribe paradas, horarios ni precios. `interpretRequest`, `routeQuestion`, `refineConversation` y `chat` siguen disponibles por compatibilidad.

Cuerpo de la petición:

```ts
{ text: string;                 // de 1 a 500 caracteres, sin espacios en los extremos
  routeId?: string;             // uuid de la ruta de la que trata el chat (la actual); sin él, no hay ruta
  client?: { today?: string; now?: string } }   // 'AAAA-MM-DD', 'HH:MM'; si faltan o no son válidos, se usa el reloj del servidor
```

Respuesta `200`:

```ts
{ text: string;                 // lo que dice Cacahuete (6 frases como máximo)
  suggestions: string[];        // de 0 a 3 respuestas cortas que el visitante puede tocar
  route?: Route;                // si la ruta se creó o cambió en este turno (Route completo del contrato)
  routeId?: string;             // la ruta actual tras el turno (nueva o la misma)
  events: AgentEvent[];         // lo que ha pasado, en orden
  source: 'agent' | 'rules';    // quién decidió
  quota: Quota }
```

```ts
type AgentEvent =
  | { type: 'route_created'; routeId: string; assumptions: string[] }
  | { type: 'route_changed'; routeId: string; change: string }       // 'add_stop' | 'remove_stop' | 'replace_stop' | 'lock_stop' | 'reschedule' | 'menos_caminar' | ...
  | { type: 'undone'; routeId: string }
  | { type: 'preferences_updated'; fields: string[] }
  | { type: 'rejected'; reason: string }                            // una negativa del planificador, en español
  | { type: 'answered' }                                            // sin herramienta: el modelo solo ha conversado
```

La ruta se crea sin paso de confirmación. Si el visitante no indica fecha, hora, duración o salida, se usan hoy, la hora actual redondeada al siguiente cuarto de hora, 3 horas y la plaza de los Naranjos; cada valor supuesto aparece en `assumptions` y el narrador lo menciona. Los nombres de lugar se resuelven en el servidor contra el `id`, el nombre y los alias del catálogo, más la pausa `marbella-cafe`. Cada turno hace como máximo dos rondas de decisión con tres herramientas por ronda. Las sugerencias las propone el narrador; si faltan o no son válidas, se usan las de `lib/agent-texts.js` según el estado.

Errores: 400 `INVALID_INPUT` (texto vacío o de más de 500 caracteres), 400 `UNSUPPORTED_CITY` (otro destino; se responde sin llamar al modelo), 404 `ROUTE_NOT_FOUND` (`routeId` de otro propietario), 403 `AGENT_TIME_EXPIRED` y 429 `RATE_LIMITED`. Cada turno consume un uso del agente, ejecute lo que ejecute. Si otra pestaña cambió la ruta entretanto no hay error: el agente trabaja siempre sobre el itinerario actual de la fila y lo devuelve.

**Modo degradado (`source: "rules"`).** Si la llamada de decisión falla (Ollama no responde, tiempo agotado, cola llena, error HTTP o llamada a herramienta ilegible), el turno se resuelve con reglas en el servidor. «Deshacer» deshace el último cambio. Con una ruta en marcha se aplican los cambios rápidos que reconocen las expresiones del planificador, dos como máximo. Sin ruta, o si el texto indica una duración, una salida o un interés, se crea una ruta con los valores predeterminados. En otro caso se devuelve `rejected` con «No he entendido qué quieres cambiar.» y las sugerencias por defecto. El texto sale de las plantillas de `lib/agent-texts.js`, aunque el narrador se intenta igualmente si es lo único que ha fallado. Si solo falla la narración (tiempo agotado, JSON no válido o más de seis frases), el texto también sale de las plantillas, pero `source` sigue siendo `"agent"` porque la decisión fue del modelo. Con `source: "rules"`, el frontend muestra el aviso «modo sin IA».

**Memoria de la conversación.** La migración `db/003_agent.sql` crea la tabla `agent_turns(id, owner_key, route_id, role, content, created_at)`, con `role` igual a `user` o `assistant` y el índice `agent_turns_owner_idx` sobre `(owner_key, id DESC)`. `owner_key` se calcula igual que en `travel_routes`: el id de la cuenta o `guest:` seguido del sha256 de `X-Guest-Token`. El modelo de decisión recibe los 10 últimos turnos y, tras cada inserción, se conservan solo los 20 más recientes del propietario. Las llamadas a herramientas se guardan como una línea compacta (`[acción] create_route → Marbella en 3 horas (3 paradas)`), no como JSON. Al entrar o registrarse, los turnos del invitado pasan a la cuenta junto con sus rutas y preferencias.

### API original de Marbella

URL base `/api/cacahuete?action=<acción>`. Envía `Content-Type: application/json` en los métodos con cuerpo y `Authorization: Bearer <token>` si hay una cuenta iniciada.

| Método | Acción | Entrada y salida |
| --- | --- | --- |
| GET | `health` | Confirma que la API llega a la base con el esquema aplicado. |
| GET | `catalog` | Devuelve ciudad, puntos de partida y lugares con coordenadas e ID. |
| GET | `status` | Devuelve `account`, `quota` y `auth: { providers, mail }`. Un invitado tiene `account: null`. `account.emailVerified` indica si el correo está confirmado. |
| POST | `register` | `{ email, password }`. Devuelve `account`, `token` y `quota` y envía el enlace de confirmación. Una contraseña no válida devuelve 400 `INVALID_INPUT` con `field` y `reason` (`PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_TOO_SIMPLE`, `PASSWORD_CONTAINS_EMAIL`, `PASSWORD_COMMON`, `EMAIL_INVALID`). |
| POST | `login` | `{ email, password }`. Devuelve la misma estructura. |
| POST | `logout` | Revoca la sesión en la base. Devuelve 204. |
| PUT | `profile` | `{ profile }` reemplaza el perfil guardado. Requiere cuenta. |
| POST | `chat` | Entrada principal de Cacahuete. Recibe texto u opciones y devuelve una pregunta o la ruta. |
| POST | `onboarding` | Devuelve `question`, `profile`, `complete`, `accepted`, `interpretation` y `quota`. |
| POST | `route` | `{ profile?, avoidStops?, scenario? }`. Devuelve `route`, `alternatives` y `quota`. |
| POST | `checkout` | Una cuenta gratuita iniciada obtiene `{ checkoutUrl }` si Stripe está configurado. Con la verificación activa, exige el correo confirmado (403 `EMAIL_NOT_VERIFIED`). |
| POST | `verifyEmail` | `{ token }` del enlace del correo. Devuelve `{ email, verified: true }`; 400 `INVALID_TOKEN` o 410 `TOKEN_EXPIRED`. |
| POST | `resendVerification` | Requiere cuenta. Envía un enlace nuevo (anula los anteriores) y devuelve 204. Máximo 3 cada 10 minutos; 409 `ALREADY_VERIFIED`; 503 `MAIL_UNAVAILABLE` si la verificación no está activa (Vercel sin correo). |
| POST | `oauthStart` | `{ provider: "google" \| "apple" }`. Devuelve `{ url, state }`; el navegador guarda `state` y abre `url`. 503 `PROVIDER_UNAVAILABLE` si faltan las claves. |
| GET, POST | `oauthCallback` | Vuelta desde Google (GET) o Apple (`form_post`). Redirige siempre a `${APP_URL}/auth/callback#state=…&ticket=…` o `#state=…&error=…`. |
| POST | `oauthExchange` | `{ ticket }` (un uso, 120 s). Devuelve `account`, `token` y `quota` como `login` y reclama el invitado de `X-Guest-Token`. |
| POST | `stripe-webhook` | Stripe confirma el pago y activa Premium. |

### Correo y acceso con Google/Apple

Las reglas de contraseña son las mismas en el formulario y en la API: entre 12 y 128 caracteres, al menos 4 distintos, sin contener el correo y fuera de la lista `lib/common-passwords.json`, que el frontend copia en `frontend/src/lib/common-passwords.json`. Una prueba comprueba que ambos archivos son idénticos.

- **Confirmación del correo.** Al registrarse se envía un enlace `${APP_URL}/verify-email?token=…` que caduca en 24 horas y sirve una sola vez. El envío usa la API REST de [Resend](https://resend.com/docs/api-reference/emails/send-email) con `RESEND_API_KEY` y `MAIL_FROM` (un remitente de un dominio verificado en Resend). Sin esas variables, el enlace se escribe en la consola del servidor: así funciona en local sin cuenta. Si el correo falla, el registro sigue adelante y la persona puede pedir otro enlace desde la app.
- **Verificación suave.** Una cuenta sin confirmar puede crear, guardar y valorar rutas; la app le recuerda que confirme el correo. Solo `checkout` (Premium) exige el correo confirmado. La verificación está activa con correo real configurado o fuera de Vercel (`status.auth.mail`).
- **Google y Apple.** El flujo OAuth/OpenID Connect termina en esta API: los secretos nunca llegan al navegador. Registra como URI de redirección `${PUBLIC_API_URL}?action=oauthCallback` (por ejemplo `https://TU_API.vercel.app/api/cacahuete?action=oauthCallback`). Sin `PUBLIC_API_URL` se usa el origen y la ruta de la propia petición, que cambia en cada Preview de Vercel. `APP_URL` es la web a la que se vuelve (por defecto, el primer origen de `FRONTEND_ORIGINS`).
  - Google: crea un cliente OAuth «Aplicación web» en Google Cloud Console, añade la URI de redirección y copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Se piden `openid email` con PKCE y solo se aceptan correos que Google marca como verificados.
  - Apple: necesita HTTPS y un dominio verificado. Crea un App ID con «Sign in with Apple», un Services ID (`APPLE_CLIENT_ID`) con el dominio y la URI de redirección, y una clave de «Sign in with Apple» (`APPLE_KEY_ID`, archivo `.p8` en `APPLE_PRIVATE_KEY`; se admiten saltos de línea escritos como `\n`). `APPLE_TEAM_ID` es el identificador del equipo. Apple vuelve con un `POST` desde `https://appleid.apple.com`; es la única acción que acepta un origen fuera de `FRONTEND_ORIGINS`.
  - Una identidad nueva cuyo correo ya tiene cuenta se vincula a ella y la marca como confirmada. Si esa cuenta aún no estaba confirmada, se anulan su contraseña y sus sesiones, porque nadie había demostrado ser el dueño del correo. Las cuentas creadas con Google o Apple no tienen contraseña: `login` responde como ante una contraseña incorrecta.
  - Los botones del frontend solo aparecen para los proveedores configurados (`status.auth.providers`).

### Chat de Cacahuete

Envía `{}` para saludar o abre directamente con `{ message }`. En cada turno posterior, envía el último `profile` y el nuevo `message`. Para las opciones usa `{ profile, questionId, answer }`; el valor de `answer` sale de `question.options`. Si `question.multiple` es verdadero, envía un arreglo de valores. Una cuenta autenticada puede iniciar el chat usando su perfil guardado. El perfil de un invitado vive en el cliente. Puede mantenerse en memoria o en `sessionStorage` para tolerar una recarga.

```js
const response = await fetch(`${apiBase}/api/cacahuete?action=chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  body: JSON.stringify({
    message: 'Salgo de la plaza de los Naranjos. Tengo una hora y media y quiero museos y tapas.'
  })
});
const result = await response.json();
```

Si `state` es `"question"`, muestra `message` y las opciones de `question` junto al campo de texto. Si `state` es `"route"`, muestra `message`, las paradas de `route` y las `alternatives`. Para recalcular, envía el mismo perfil y un mensaje como «Mejor 45 minutos». Para omitir una parada, envía sus identificadores en `avoidStops`. Reenvía esa lista en los turnos siguientes si quieres conservar la exclusión.

Cacahuete necesita un punto de partida, una duración y al menos un interés. El visitante puede indicar también presupuesto, ritmo, preferencia sobre escaleras y afluencia. `appliedDefaults` muestra los valores que el planificador aplicó cuando faltaban esas opciones. Conserva `profile` para el siguiente turno, con las preferencias expresadas por el visitante.

Si el visitante quiere parar para comer, Cacahuete pregunta cuánto tiempo apartar del total. La respuesta se conserva en `profile.mealMinutes`. El itinerario reserva esa pausa al final del paseo. `route.totalMinutes` incluye desplazamientos, visitas y pausa. Una reserva de mesa requeriría una integración con el restaurante. Conserva también `excludedStops` y `excludedInterests` dentro del perfil devuelto para respetar los descartes en los turnos siguientes.

El formulario que integraba `onboarding` y `route` puede seguir enviando la pregunta paso a paso. Cuando `complete` sea `true`, envía el perfil a `route`.

Una ruta incluye coordenadas, explicación por parada, marca de patrocinio, minutos orientativos y un enlace de navegación a pie. Para la demo, envía `scenario: "busy-centre"` junto al perfil y establece `profile.crowd` en `"evitar"`. Puedes enviar `avoidStops: ["naranjos"]` para saltar paradas elegidas por el visitante. Marca como simulada la afluencia cuando `crowdSource === "simulated"`. Las alternativas Premium indican si cambian las paradas (`different-stops`) o acortan el recorrido (`shorter`).

Al agotarse el acceso, la API responde con HTTP 403 y `error.code: "AGENT_TIME_EXPIRED"`. `quota` contiene `plan`, `remainingSeconds` y `expiresAt`. En Premium, los dos últimos campos valen `null`.

## Comportamiento del MVP

- Invitados y cuentas gratuitas reciben tres horas corridas desde su primera petición válida al agente. Las cuentas tienen su propio reloj. Para invitados se conserva una marca temporal asociada a un HMAC de la IP de conexión que ve Vercel. Usuarios de una misma red pública pueden compartir esa cuota. El perfil del invitado se mantiene en el cliente. La API guarda preferencias de cuentas registradas al terminar el cuestionario o al guardar explícitamente el perfil.
- El agente combina clasificadores de intereses y preferencias en español con reglas para interpretar duración, punto de partida y correcciones. La función calcula el turno y la ruta a partir del catálogo, el perfil y la cuota. `interpretation: "model"` indica que intervino el clasificador en la interpretación de ese turno.
- Premium usa una búsqueda más amplia, admite hasta cinco paradas y devuelve hasta dos itinerarios alternativos. Aplica una penalización a lugares patrocinados y permite como máximo uno por itinerario. La versión gratuita admite hasta tres paradas.
- Para un pago único Premium, configura `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` con un precio de pago único y `STRIPE_WEBHOOK_SECRET`. Configura en Stripe el endpoint `/api/cacahuete?action=stripe-webhook` para `checkout.session.completed` y `checkout.session.async_payment_succeeded`. El frontend redirige a `checkoutUrl` y, al regresar, consulta `status` hasta que Stripe confirme el plan. El MVP no automatiza reembolsos ni revocaciones. [Documentación de Stripe Checkout](https://docs.stripe.com/checkout/fulfillment)
- Las paradas y sus coordenadas son puntos de referencia. Las duraciones de marcha estiman la distancia a pie. Los horarios, accesibilidad del trayecto, aforo real y reserva de actividades quedan fuera del catálogo inicial. [Turismo de España](https://www.spain.info/es/destino/marbella/) · [Casco Antiguo de Marbella](https://cascoantiguodemarbella.com/para-visitar/)

## Entrenar Cacahuete

Desde la raíz del repositorio o desde `backend/`, ejecuta `npm run train:chat`. Con Node.js 22, el entrenamiento y la inferencia funcionan en CPU. El entrenamiento escribe el resultado en `backend/model/interests.json`. La función de Vercel carga ese archivo junto con el vocabulario al arrancar.

Cacahuete utiliza las 3.000 piezas del vocabulario público español BPEmb de Benjamin Heinzerling y Michael Strube. La segmentación usa su orden de fusión en palabras normalizadas. Sobre esas piezas, palabras y fragmentos de caracteres se entrenan clasificadores multietiqueta propios. El modelo incluido usa el vocabulario público y pesos de clasificación aprendidos con los ejemplos del proyecto. Los vectores semánticos BPEmb de 25 dimensiones son opcionales. [Vocabulario original](https://bpemb.h-its.org/es/es.wiki.bpe.vs3000.vocab) · [Proyecto BPEmb](https://bpemb.h-its.org/es/)

- `scripts/interest-examples.js` contiene peticiones en español etiquetadas con seis intereses turísticos.
- `scripts/dialogue-examples.js` contiene conversaciones sintéticas y paráfrasis. Cada turno se etiqueta por lo que aporta, como ritmo lento, acceso sin escalones, presupuesto o una pausa para comer. El chat interpreta el texto junto con el perfil del turno anterior y decide con reglas qué dato falta. Los ejemplos se escribieron para la demo.
- `scripts/route-examples.js` contiene pares de paradas de Marbella que caben en un mismo itinerario y una elección preferida para cada par. De ellos se aprenden los pesos para puntuar la coincidencia con intereses, la variedad y la proporción del tiempo que se consume caminando. El planificador aplica las restricciones de la visita y las condiciones del plan de usuario.
- Al terminar se imprimen las métricas de los ejemplos reservados. Los tres conjuntos de evaluación son pequeños y sintéticos.

Para incorporar los vectores semánticos publicados, usa `npm run train:chat -- --bpemb` con acceso al servidor oficial. Si ya tienes `es.wiki.bpe.vs3000.vocab` y `es.wiki.bpe.vs3000.d25.w2v.txt.tar.gz` en la misma carpeta, usa `npm run train:chat -- --bpemb-dir ./carpeta`. El campo `base` del artefacto identifica los vectores cuando están presentes. Un fallo de descarga conserva el último modelo completo.
