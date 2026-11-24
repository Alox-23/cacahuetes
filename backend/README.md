# API de Cacahuete

Cacahuete recoge preferencias y propone rutas turísticas a pie por Marbella. El catálogo incluye el casco antiguo, el paseo marítimo y Puerto Banús. Está pensado para conectar un frontend en Cloudflare Pages con una API de JavaScript en Vercel y un PostgreSQL externo.

## En local

Desde `backend/`, con Node.js 22 y una base PostgreSQL vacía:

```powershell
npm ci
Copy-Item .env.example .env
```

Antes de migrar, rellena `DATABASE_URL` y `QUOTA_SECRET` en `.env`. Puedes generar el secreto con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Mantén el mismo valor entre despliegues para conservar la validez de las cuotas existentes.

```powershell
npm run migrate
npm run dev
```

`npm test` comprueba los flujos con el motor de PostgreSQL embebido de PGlite. Las peticiones externas de las pruebas se simulan.

## En Vercel y Cloudflare

1. Importa el repositorio en Vercel, selecciona `backend` como **Root Directory**, **Other** como **Framework Preset** y deja vacíos los comandos de build y la carpeta de salida. Para la rama `fran-backend`, usa un despliegue Preview que admita peticiones del navegador si se va a probar desde Cloudflare.
2. Conecta PostgreSQL, por ejemplo Neon desde el Marketplace. Configura `DATABASE_URL` con la URL del pool y ejecuta `npm run migrate` una vez con esa misma base antes de conectar el frontend.
3. Configura `QUOTA_SECRET` y `FRONTEND_ORIGINS` en el entorno del despliegue. En la última, indica orígenes completos separados por comas, como `https://ejemplo.pages.dev,https://turismo.ejemplo.org`, sin barras finales. El navegador llama directamente a Vercel por HTTPS. Cloudflare Pages puede servir la web desde su dominio propio o el de Pages.
4. La función de Vercel carga `model/interests.json` desde el proyecto. Para el escenario de afluencia de la demo, establece `DEMO_SCENARIOS=true`. `PARTNER_PLACE_IDS` acepta los ID de socios confirmados, separados por comas.
5. Despliega y consulta `https://TU_API.vercel.app/api/cacahuete?action=health`. En el frontend, usa la URL de Vercel como base pública. Las claves de PostgreSQL y Stripe se configuran solo en el servidor.

Documentación de [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js) y [PostgreSQL en Vercel](https://vercel.com/docs/postgres).

## Contrato para el frontend

### Integración con `alex-frontend`

Aplica `npm run migrate` también en instalaciones existentes para crear las tablas de rutas y preferencias. En `frontend/`, copia `.env.example` a `.env.local` y arranca Vite. Para Cloudflare Pages, define `VITE_CACAHUETE_API_URL` con la URL completa de la función en Vercel antes de compilar. Añade el origen público de Pages a `FRONTEND_ORIGINS`.

El adaptador HTTP implementa `frontend/src/contract/types.ts`. El chat conserva el cuestionario, las opciones y el resumen que el visitante confirma. Las peticiones de texto pasan por el intérprete de Cacahuete y las rutas se crean al confirmar. El único destino es Marbella. El chat propone puntos de salida del catálogo y acepta sus nombres o alias. Los horarios parten de ese lugar. La API devuelve HTTP 400 si la ciudad, la salida o un imprescindible quedan fuera del catálogo. Las rutas antiguas de otras ciudades se conservan en la base y quedan fuera de las consultas. Los tiempos de desplazamiento son estimaciones.

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

El adaptador usa `status`, `login`, `register` y `logout` para la sesión. Cada navegador genera una credencial aleatoria de invitado y la envía en `X-Guest-Token`. Al entrar o registrarse se transfieren sus borradores a la cuenta. Las preferencias de una cuenta existente prevalecen sobre las del invitado. La cuota de invitado continúa asociada a la red. Una edición concurrente que pierda la carrera devuelve HTTP 409 y permite volver a cargar la ruta.

### API original de Marbella

URL base `/api/cacahuete?action=<acción>`. Envía `Content-Type: application/json` en los métodos con cuerpo y `Authorization: Bearer <token>` si hay una cuenta iniciada.

| Método | Acción | Entrada y salida |
| --- | --- | --- |
| GET | `health` | Confirma que la API llega a la base con el esquema aplicado. |
| GET | `catalog` | Devuelve ciudad, puntos de partida y lugares con coordenadas e ID. |
| GET | `status` | Devuelve `account` y `quota`. Un invitado tiene `account: null`. |
| POST | `register` | `{ email, password }`. Devuelve `account`, `token` y `quota`. |
| POST | `login` | `{ email, password }`. Devuelve la misma estructura. |
| POST | `logout` | Revoca la sesión en la base. Devuelve 204. |
| PUT | `profile` | `{ profile }` reemplaza el perfil guardado. Requiere cuenta. |
| POST | `chat` | Entrada principal de Cacahuete. Recibe texto u opciones y devuelve una pregunta o la ruta. |
| POST | `onboarding` | Devuelve `question`, `profile`, `complete`, `accepted`, `interpretation` y `quota`. |
| POST | `route` | `{ profile?, avoidStops?, scenario? }`. Devuelve `route`, `alternatives` y `quota`. |
| POST | `checkout` | Una cuenta gratuita iniciada obtiene `{ checkoutUrl }` si Stripe está configurado. |
| POST | `stripe-webhook` | Stripe confirma el pago y activa Premium. |

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
