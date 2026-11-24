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
4. Para usar el modelo, añade `OPENAI_API_KEY` y opcionalmente `OPENAI_MODEL`. Para el escenario de afluencia de la demo, establece `DEMO_SCENARIOS=true`. `PARTNER_PLACE_IDS` acepta los ID de socios confirmados, separados por comas.
5. Despliega y consulta `https://TU_API.vercel.app/api/cacahuete?action=health`. En el frontend, usa la URL de Vercel como base pública. Las claves de PostgreSQL, OpenAI y Stripe se configuran solo en el servidor.

Documentación de [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js) y [PostgreSQL en Vercel](https://vercel.com/docs/postgres).

## Contrato para el frontend

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

El formulario que integraba `onboarding` y `route` puede seguir enviando la pregunta paso a paso. Cuando `complete` sea `true`, envía el perfil a `route`.

Una ruta incluye coordenadas, explicación por parada, marca de patrocinio, minutos orientativos y un enlace de navegación a pie. Para la demo, envía `scenario: "busy-centre"` junto al perfil y establece `profile.crowd` en `"evitar"`. Puedes enviar `avoidStops: ["naranjos"]` para saltar paradas elegidas por el visitante. Marca como simulada la afluencia cuando `crowdSource === "simulated"`. Las alternativas Premium indican si cambian las paradas (`different-stops`) o acortan el recorrido (`shorter`).

Al agotarse el acceso, la API responde con HTTP 403 y `error.code: "AGENT_TIME_EXPIRED"`. `quota` contiene `plan`, `remainingSeconds` y `expiresAt`. En Premium, los dos últimos campos valen `null`.

## Comportamiento del MVP

- Invitados y cuentas gratuitas reciben tres horas corridas desde su primera petición válida al agente. Las cuentas tienen su propio reloj. Para invitados se conserva una marca temporal asociada a un HMAC de la IP de conexión que ve Vercel. Usuarios de una misma red pública pueden compartir esa cuota. El perfil del invitado se mantiene en el cliente. La API guarda preferencias de cuentas registradas al terminar el cuestionario o al guardar explícitamente el perfil.
- El agente usa un modelo preentrenado, por defecto GPT‑4.1 mini, y un conjunto de instrucciones que lo acota a extraer preferencias. OpenAI recibe el último mensaje, los campos turísticos del perfil y la pregunta pendiente. La API solicita `store: false` y valida cada campo devuelto. El backend decide qué preguntar y calcula la ruta con su catálogo, el perfil y la cuota. Las opciones y frases sencillas funcionan con reglas si OpenAI no está configurado o no responde.
- Premium usa una búsqueda más amplia, admite hasta cinco paradas y devuelve hasta dos itinerarios alternativos. Aplica una penalización a lugares patrocinados y permite como máximo uno por itinerario. La versión gratuita admite hasta tres paradas.
- Para un pago único Premium, configura `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` con un precio de pago único y `STRIPE_WEBHOOK_SECRET`. Configura en Stripe el endpoint `/api/cacahuete?action=stripe-webhook` para `checkout.session.completed` y `checkout.session.async_payment_succeeded`. El frontend redirige a `checkoutUrl` y, al regresar, consulta `status` hasta que Stripe confirme el plan. El MVP no automatiza reembolsos ni revocaciones. [Documentación de Stripe Checkout](https://docs.stripe.com/checkout/fulfillment)
- Las paradas y sus coordenadas son puntos de referencia. Las duraciones de marcha estiman la distancia a pie. Los horarios, accesibilidad del trayecto, aforo real y reserva de actividades quedan fuera del catálogo inicial. [Turismo de España](https://www.spain.info/es/destino/marbella/) · [Casco Antiguo de Marbella](https://cascoantiguodemarbella.com/para-visitar/)
