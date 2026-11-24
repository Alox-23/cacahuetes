# Feature 4 · Secure account: password rules, email verification, Google and Apple sign-in

Date: 2026-11-24 · Branch: `feature/auth-validation` (forked from `dev` at `5288aee`) · Merges into: `dev` · Builds on: `feature-2-ruta-mis-rutas-perfil.md` and the `fran-backend` API (`backend/README.md`)

This is the first spec that touches both halves of the repo. The backend (`backend/`, Vercel function + PostgreSQL) gains real password rules, verification emails and an OAuth/OpenID Connect sign-in, and the frontend (`frontend/`) exposes them through the existing `DataModule` seam so the standalone demo (mock data) keeps working. Where this document is silent, the feature 2 spec, the package rules in `frontend/docs/` and the backend README apply.

## 1. Goal

1. **Password validation** that is the same on the client and the server (today the client accepts 8 characters and the server rejects anything under 12, and the form shows no server error at all).
2. **Email verification**: registering sends an email with a one-time link; the account knows whether its address is confirmed; users can resend the email; the app shows the state and nudges.
3. **Sign in with Google and Apple**: the two buttons that already exist on Crear cuenta / Entrar perform a real OAuth 2.0 / OIDC authorization-code sign-in handled by the backend, creating or linking an account. The mock data module keeps its current fake behaviour so the demo and the tests work without providers.

## 2. Scope

### In scope

| Area | Change |
| --- | --- |
| Backend schema | `db/002_auth.sql`: nullable `password_hash`, `email_verified_at`, tables `email_verifications`, `account_identities`, `oauth_states`, `login_tickets`. Migration runner applies every `db/*.sql` in order. |
| Backend modules | `lib/password.js` (rules), `lib/mail.js` (Resend HTTP transport + console fallback), `lib/verification.js` (tokens, send, verify, resend), `lib/oauth.js` (Google + Apple, tickets), `lib/schema.js` (apply all SQL files; used by migrate and tests). |
| Backend actions | `verifyEmail`, `resendVerification`, `oauthStart`, `oauthCallback`, `oauthExchange`; `status` adds `auth`; `account` objects add `emailVerified`; `checkout` requires a verified email. |
| Frontend contract | `Session.emailVerified?`, `AuthProvider`, `DataModule.verifyEmail / resendVerification / authProviders / signInWith / completeSignIn`; `docs/contract/types.ts` and `src/contract/types.ts` stay byte-identical. |
| Frontend data | `httpData.ts` implements the new calls and throws structured `ApiClientError`s; `mockData.ts` simulates verification and keeps the fake Google/Apple sign-in. |
| Frontend screens | Crear cuenta / Entrar: shared rules, live password hint, show/hide password, server errors shown. New undesigned screens: **Confirma tu correo** (`/verify-pending`), **Correo confirmado** (`/verify-email`), **Entrando…** (`/auth/callback`). `VerifyEmailNotice` banner on Perfil and Cuenta. |
| Docs & env | `.env.example` (root + backend), `backend/README.md` (actions, env vars, provider setup), `frontend/README.md` (new routes). |
| Tests | New `backend/test/auth.test.js`, extended `backend/test/frontend-contract.test.js`, new `frontend/src/auth.test.tsx`, feature 2 tests updated for the new post-register flow. |

### Out of scope

Password reset ("¿Olvidaste tu contraseña?" keeps the "Función pendiente" toast), change password from Cuenta, changing the account email, storing the user's name server-side (Apple sends it only once; ignored), 2FA, account merging UI, enforcing verification for routes/saving (soft gate, see §3), HTML email design beyond a plain branded template, localisation other than Spanish.

## 3. Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Password policy | Length 12–128 (no composition rules), at least 4 distinct characters, must not contain the email's local part (when ≥ 4 chars) or the whole email, not in a shared denylist of ~100 common passwords. Login keeps "non-empty" only. | NIST SP 800-63B style: length over complexity; matches the server's existing 12-char floor. |
| Where the rules live | Once per side: `backend/lib/password.js` and `frontend/src/lib/validation.ts`, both reading an identical `common-passwords.json`. A backend test asserts the two JSON files are byte-identical. | The backend cannot import frontend TypeScript at runtime; a test stops drift. |
| Server error contract | 400 `INVALID_INPUT` with `details: { field: 'email' \| 'password', reason: PASSWORD_TOO_SHORT \| PASSWORD_TOO_LONG \| PASSWORD_TOO_SIMPLE \| PASSWORD_CONTAINS_EMAIL \| PASSWORD_COMMON \| EMAIL_INVALID }`. Frontend maps `reason` to its own copy and falls back to `message`. | Field-level errors without parsing Spanish strings. |
| Verification enforcement | **Soft gate.** Unverified accounts can create, save and rate routes. They see a notice on Perfil and Cuenta and land on Confirma tu correo right after registering. `checkout` (Premium) returns 403 `EMAIL_NOT_VERIFIED`. Only enforced when mail is configured. | Does not break the guest-save flow or existing tests; the payment path is where an unconfirmed address actually costs something. Easy to tighten later. |
| Mail transport | `lib/mail.js` calls the Resend REST API with global `fetch` (same pattern as Stripe in `billing.js`), `AbortSignal.timeout(8_000)`, no SDK. Without `RESEND_API_KEY`/`MAIL_FROM` it logs the message text (with the link) to the console and resolves. `status.auth.mail` tells the frontend whether real mail is on. | No new dependency, testable by mocking `fetch`, works in local dev with no account. |
| Verification token | 32 random bytes base64url; SHA-256 hash stored; 24 h expiry; single use; resending deletes the account's older tokens. Link: `${APP_URL}/verify-email?token=…`. | Same hashing approach as sessions; a leaked database does not yield usable links. |
| Register when mail fails | Registration still succeeds (account + session returned); the error is logged with its code only. The user can resend from the app. | A mail outage must not block sign-up. |
| OAuth flow shape | Authorization-code flow terminated **on the backend** for both providers: `oauthStart` → provider → `oauthCallback` (backend, GET for Google, POST `form_post` for Apple) → 302 to `${APP_URL}/auth/callback#state=…&ticket=…` → frontend `oauthExchange {ticket}` → `{account, token, quota}`. | Apple requires `response_mode=form_post` when asking for email, which a static SPA cannot receive. Client secrets never reach the browser, no third-party scripts, and the exchange step lets the browser send `X-Guest-Token` so guest drafts are claimed exactly like password login. |
| State / nonce / PKCE | Backend generates `state` and `nonce` (and PKCE S256 for Google), stores them hashed in `oauth_states` for 10 min, returns `{url, state}`; the frontend keeps `state` in `sessionStorage` and compares it on return. Apple has no PKCE. | Standard CSRF/replay protections; Apple does not support PKCE. |
| Login ticket | 32 random bytes base64url, hashed, 120 s, single use (`DELETE … RETURNING`). Returned in the URL **fragment**, never the query. | Fragments are not sent to servers or logged by CDNs. |
| Account linking | Lookup `(provider, subject)` → sign in. Else an existing account with the same (provider-verified) email → link identity and mark verified. Else create an account with `password_hash NULL` and `email_verified_at = now()`. | Email from Google/Apple is verified by the provider (require `email_verified` for Google; Apple relay addresses are accepted as emails). |
| Password login on OAuth-only accounts | 401 `INVALID_CREDENTIALS`, same message and timing as a wrong password. | No account enumeration, no crash on `NULL` hash. |
| JWT verification | Use the `jose` package (`jwtVerify`, `createLocalJWKSet`, `SignJWT`, `importPKCS8`). JWKS are fetched with global `fetch` (8 s timeout), cached in module memory for 1 h per provider, refetched once on a `kid` miss. | Hand-rolled RS256/ES256 is where auth bugs live. `jose` has zero dependencies and runs on Node 22. JWKS fetched by us so tests can mock `fetch`. |
| Origin check on `oauthCallback` | The handler's `Origin` allow-list is skipped for `oauthCallback` only. | Apple's `form_post` arrives as a cross-site POST with `Origin: https://appleid.apple.com`; Google's redirect is a GET navigation. Neither is a CORS request. |
| Methods map | `methods` values may be a string or an array (`oauthCallback: ['GET', 'POST']`). | One action, two providers. |
| Redirect URI | `${PUBLIC_API_URL}?action=oauthCallback`, where `PUBLIC_API_URL` defaults to the request's own origin + pathname. | Vercel preview URLs differ per deployment; production sets the env var. |
| Which buttons appear | `authProviders()` returns the configured providers (from `status.auth.providers`); buttons and the "o con tu correo" divider render only for those. Mock mode returns both and keeps the fake sign-in (`google@ejemplo.com` / `apple@ejemplo.com` through `login`). | No dead buttons on a deployment without keys; the demo is unchanged. |
| After register | Save the pending route (if any) exactly as today, then go to `/verify-pending` when `session.emailVerified === false`; "Continuar" there goes to `returnTo ?? /my-routes`. When verification is not in play (`emailVerified` undefined) go straight to `returnTo`. | Shows the mail step once without blocking the user. |
| After OAuth | Straight to `returnTo ?? /my-routes` (provider accounts are verified). `returnTo`/`saveRouteId` survive the redirect in `sessionStorage` (`rt.auth.return`). `returnTo` must be a same-origin path starting with `/` or it is ignored. | Prevents open redirects. |
| Undesigned screens | Reuse `layout.module.css` (title block, subtitle, footer buttons) and the `Mascot` component; no new tokens; text in `es.json`. | Consistent with feature 2's "undesigned states" rule. |
| Common password list | `backend/lib/common-passwords.json` and `frontend/src/lib/common-passwords.json`: top ~100 entries (e.g. `password`, `123456789012`, `contraseña123`, `qwertyuiop12`), lower-case; compare lower-cased. Only entries ≥ 12 chars matter, but keep the list honest. | Cheap, offline, same on both sides. |

## 4. Backend

### 4.1 Schema (`backend/db/002_auth.sql`, idempotent, wrapped in `BEGIN/COMMIT`)

```sql
ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS email_verifications_account_idx ON email_verifications(account_id);

CREATE TABLE IF NOT EXISTS account_identities (
  provider text NOT NULL CHECK (provider IN ('google', 'apple')),
  subject text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS account_identities_account_idx ON account_identities(account_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  nonce text NOT NULL,
  code_verifier text,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS login_tickets (
  ticket_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
```

`lib/schema.js` exports `schemaFiles()` (sorted `db/*.sql`) and `applySchema(db)` (runs each with `db.query`/`db.exec`). `scripts/migrate.js` and all three test files use it instead of reading `001_init.sql` directly. Running it twice must be a no-op (PGlite and PostgreSQL).

### 4.2 Password rules (`lib/password.js`)

`validatePassword(password, email)` returns `null` or a reason code (`PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_TOO_SIMPLE`, `PASSWORD_CONTAINS_EMAIL`, `PASSWORD_COMMON`), checked in that order. `accounts.js › credentials()` uses it for registration and throws `new ApiError(400, 'INVALID_INPUT', <Spanish message>, { field: 'password', reason })`. Email failures throw with `{ field: 'email', reason: 'EMAIL_INVALID' }`. Messages:

| Reason | Message |
| --- | --- |
| `PASSWORD_TOO_SHORT` | La contraseña debe tener al menos 12 caracteres. |
| `PASSWORD_TOO_LONG` | La contraseña no puede superar los 128 caracteres. |
| `PASSWORD_TOO_SIMPLE` | Usa al menos 4 caracteres distintos. |
| `PASSWORD_CONTAINS_EMAIL` | La contraseña no puede contener tu correo. |
| `PASSWORD_COMMON` | Esa contraseña es demasiado común. Elige otra. |

### 4.3 Mail (`lib/mail.js`)

- `mailConfigured()` → `Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)`.
- `sendMail({ to, subject, text, html })`: when configured, `POST https://api.resend.com/emails` with `Authorization: Bearer`, JSON `{ from, to: [to], subject, text, html }`, `AbortSignal.timeout(8_000)`; non-2xx → throw `ApiError(502, 'MAIL_FAILED')`. When not configured: `console.log` the subject, recipient and text (includes the link) and resolve.
- `appUrl()` → `process.env.APP_URL ?? configuredOrigins()[0]`; throw `ApiError(503, 'MAIL_UNAVAILABLE')` if neither exists when a link is needed.

### 4.4 Verification (`lib/verification.js`)

- `issueVerification(db, account)` → deletes older tokens of the account, inserts a new hashed one (24 h), sends the email ("Confirma tu correo en Cacahuete", plain text + minimal HTML with the button/link and a line saying to ignore it if they did not sign up). Returns nothing. Errors are caught by the caller of register and logged (`console.error('Verification mail failed:', error.code ?? error.name)`); `resendVerification` propagates them (502).
- `verifyEmail(db, token)` → `token` must match `/^[A-Za-z0-9_-]{43}$/`; `DELETE FROM email_verifications WHERE token_hash=$1 RETURNING account_id, email, expires_at`; missing → 400 `INVALID_TOKEN` ("Este enlace no es válido."); expired → 410 `TOKEN_EXPIRED` ("Este enlace ha caducado. Pide uno nuevo desde la app."); else `UPDATE accounts SET email_verified_at = coalesce(email_verified_at, now()) WHERE id=$1 AND email=$2` and return `{ email, verified: true }`.
- `register` in `handler.js`: after creating the account and claiming the guest, `await issueVerification(db, account).catch(log)` when `mailConfigured()` **or** not on Vercel (so local dev always prints the link). Define `verificationActive = () => mailConfigured() || !process.env.VERCEL`.

### 4.5 OAuth (`lib/oauth.js`)

Config per provider (all read from `process.env` at call time):

| Provider | Env | Notes |
| --- | --- | --- |
| google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | authorize `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, JWKS `https://www.googleapis.com/oauth2/v3/certs`, issuers `https://accounts.google.com` and `accounts.google.com`. Scope `openid email`, `prompt=select_account`, PKCE S256. Require `email_verified === true`. |
| apple | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PKCS#8 PEM, `\n` escaped allowed) | authorize `https://appleid.apple.com/auth/authorize`, token `https://appleid.apple.com/auth/token`, JWKS `https://appleid.apple.com/auth/keys`, issuer `https://appleid.apple.com`. Scope `email`, `response_mode=form_post`. `client_secret` = ES256 JWT `{ iss: team, sub: clientId, aud: 'https://appleid.apple.com', iat, exp: iat+300 }` with `kid` header, signed with `importPKCS8(key, 'ES256')`. `email_verified` may be boolean or the string `'true'`; accept both; if absent, accept (Apple always verifies). Ignore the `user` form field. |

Exports:

- `providers()` → configured provider names (array, stable order `['google', 'apple']`).
- `startAuthorization(db, provider, request)` → `{ url, state }`. 503 `PROVIDER_UNAVAILABLE` ("Este método de acceso no está disponible.") when not configured. Generates `state`, `nonce`, `code_verifier` (Google) with `randomBytes(32).toString('base64url')`; stores `sha256(state)`, nonce, verifier, `now()+10 min`; opportunistically deletes expired rows.
- `handleCallback(db, request)` → returns a `Response` 302 to `${appUrl()}/auth/callback#state=<state>&ticket=<ticket>` or `#state=<state>&error=<code>`. Reads params from the query (GET) or the `application/x-www-form-urlencoded` body (POST, via `readText`). Error codes: `access_denied` (user cancelled, from the provider's `error`), `invalid_state`, `exchange_failed`, `invalid_token`, `email_unverified`, `provider_unavailable`. Never throws to the client as JSON; every failure becomes a redirect so the user lands in the app. Steps: consume state (`DELETE … RETURNING`, must be unexpired) → exchange code at the token endpoint (`fetch`, 8 s) → `jwtVerify(id_token, jwks, { issuer, audience })` → check `nonce` claim equals stored nonce → extract `sub`, `email` (lower-cased, trimmed), `email_verified` → `accountForIdentity` → issue ticket.
- `accountForIdentity(db, provider, subject, email)` as in §3 (linking rules). The whole thing is a few statements; use `INSERT … ON CONFLICT (email) DO NOTHING` and re-select to survive races.
- `exchangeTicket(db, ticket)` → `{ account }` or 400 `INVALID_TICKET` ("El acceso ha caducado. Vuelve a intentarlo."). Ticket regex `/^[A-Za-z0-9_-]{43}$/`.

### 4.6 Handler changes (`lib/handler.js`)

```
methods += verifyEmail: POST, resendVerification: POST, oauthStart: POST,
           oauthCallback: ['GET','POST'], oauthExchange: POST
```

- Origin check: `if (action !== 'oauthCallback' && request.headers.has('origin') && !allowed) 403`.
- `oauthCallback`: `return handleCallback(db, request)` before any JSON parsing; headers from `corsHeaders` are not needed (add `Cache-Control: no-store`).
- `oauthStart`: rate limit `oauthStart:${network}` 20/300 s; body `{ provider }` (string, one of the two) → `json(await startAuthorization(...), 200)`.
- `oauthExchange`: rate limit `oauthExchange:${network}` 20/300 s; body `{ ticket }`; `exchangeTicket` → create a session row like `login` does (factor `createSession(db, accountId)` out of `accounts.js`) → `claimGuest` when `X-Guest-Token` is present → `json({ account: publicAccount(account), token, quota: trialInfo(account) }, 200)`.
- `verifyEmail`: public; rate limit `verifyEmail:${network}` 20/300 s; body `{ token }` → 200 `{ email, verified: true }`.
- `resendVerification`: `authenticate(..., true)`; 409 `ALREADY_VERIFIED` ("Tu correo ya está confirmado.") when verified; rate limit `resendVerification:${account.id}` 3/600 s; `issueVerification`; 204.
- `status`: add `auth: { providers: providers(), mail: verificationActive() }`.
- `checkout`: before `startCheckout`, `if (verificationActive() && !account.email_verified_at) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Confirma tu correo antes de pasar a Premium.')`.
- `publicAccount(account)` adds `emailVerified: Boolean(account.email_verified_at)`; every `SELECT` that feeds it (`register`, `login`, `authenticate`, identity lookups) includes `email_verified_at`.
- `login()`: when `account?.password_hash` is null use the dummy salt/hash path so timing and message match a wrong password.
- The `register`/`login` branch stays as is otherwise; `register` adds the verification mail after `claimGuest`.

### 4.7 Env and docs

`backend/.env.example` and root `.env.example` add, with comments:

```
APP_URL=http://localhost:5173
PUBLIC_API_URL=http://127.0.0.1:3000/api/cacahuete
RESEND_API_KEY=
MAIL_FROM=Cacahuete <no-reply@example.com>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
```

`backend/README.md`: new rows in the actions table, a "Correo y acceso con Google/Apple" section explaining the redirect URI to register at each provider (`${PUBLIC_API_URL}?action=oauthCallback`), that Apple needs HTTPS and a verified domain, the soft-gate rule and that without `RESEND_API_KEY` the link is printed in the server console. `package.json` adds `"jose": "^5"` (or current v6) to dependencies.

## 5. Frontend

### 5.1 Contract (`docs/contract/types.ts` = `src/contract/types.ts`)

```ts
// Añadido en feature 4: acceso con proveedores externos.
export type AuthProvider = "google" | "apple";

export type Session = {
  kind: "guest" | "account";
  name?: string;
  email?: string;
  settings?: AccountSettings;
  emailVerified?: boolean;         // Añadido en feature 4: solo cuentas; undefined = la verificación no está activa
};

// DataModule additions (// Añadido en feature 4)
verifyEmail(token: string): Promise<{ email: string }>;
resendVerification(): Promise<void>;
authProviders(): Promise<AuthProvider[]>;
/** Starts the provider sign-in. With a backend it navigates away and never resolves; the demo resolves with the session. */
signInWith(provider: AuthProvider): Promise<Session>;
/** Finishes the provider sign-in on /auth/callback from the URL fragment (state + ticket). */
completeSignIn(fragment: string): Promise<Session>;
```

### 5.2 Errors (`src/data/errors.ts`)

```ts
export class ApiClientError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly details: Record<string, unknown> = {}) { super(message) }
}
```

`httpData.call()` throws `ApiClientError(problem.error.message, problem.error.code ?? 'HTTP_' + status, status, rest)`; the mock module throws it for `EMAIL_EXISTS` (register with an email already registered in this browser; keep a `rt.accounts` list of registered emails) and `INVALID_TOKEN`. Everything else that currently throws `Error` may stay.

### 5.3 Validation (`src/lib/validation.ts`)

- `MIN_PASSWORD = 12`, `MAX_PASSWORD = 128`.
- `passwordProblem(password, email): PasswordReason | null` with the same five reasons and order as the backend; imports `common-passwords.json` (`resolveJsonModule` is on; add the file).
- `isValidPassword` stays for login (non-empty) — rename to `hasPassword` if cleaner, update callers.
- `isValidEmail` unchanged.

### 5.4 Crear cuenta / Entrar (`pages/auth/AuthForm.tsx`)

- Password field: `placeholder` "Mínimo 12 caracteres"; a "Mostrar"/"Ocultar" text toggle (button, `aria-pressed`) that switches `type`; on **register**, after the first keystroke, a muted hint line under the field with the first unmet rule (not an error until submit); on submit the hint becomes the field error.
- Server errors: catch `ApiClientError` in `enter()`. `INVALID_INPUT` with `details.field` → that field's error (map `details.reason` to `auth.reason.<REASON>` keys, fall back to `message`); `EMAIL_EXISTS` → email field error "Ya existe una cuenta con este correo." plus the existing "¿Ya tienes cuenta? Entrar" button; `INVALID_CREDENTIALS`, `RATE_LIMITED`, network/other → a form-level error line (`role="alert"`, `--color-danger`) above the footer buttons. Never leave a rejected promise unhandled.
- Provider buttons: `const providers = useAuthProviders()` (loads `data.authProviders()` once, `[]` while loading). Render the buttons and the divider only when `providers.length > 0`. Click → `sessionStorage.setItem('rt.auth.return', JSON.stringify(state ?? {}))`, then `await data.signInWith(provider)`; if it resolves run `afterSignIn`.
- `afterSignIn(session, state)` moves to `pages/auth/afterSignIn.ts` (a hook `useAfterSignIn()` returning the async function): save `state.saveRouteId` if present (toast `toast.routeSaved`, swallow errors), `refreshSession()`, then navigate: `session.emailVerified === false` and the sign-in was a **register** → `/verify-pending` with `{ returnTo }` in router state; otherwise `safeReturnTo(state.returnTo) ?? '/my-routes'`. `safeReturnTo` accepts only strings starting with a single `/`.

### 5.5 New screens (undesigned, Spanish copy in `es.json` under `verify.*` and `oauth.*`)

| URL | Component | Behaviour |
| --- | --- | --- |
| `/verify-pending` | `VerifyPendingPage` | `RequireAccount` (fallback `/login`). If `session.emailVerified !== false` → `Navigate` to `returnTo ?? /my-routes`. Otherwise: Header "Confirma tu correo", Mascot, title "Revisa tu correo", text "Te hemos enviado un enlace a {email}. Ábrelo para confirmar tu cuenta.", primary button "Reenviar correo" (calls `resendVerification`, toast "Correo enviado"; on `RATE_LIMITED` toast "Espera unos minutos antes de volver a enviarlo"), text button "Continuar" → `returnTo ?? /my-routes`. |
| `/verify-email?token=…` | `VerifyEmailPage` | Public. On mount call `verifyEmail(token)`; states: loading (TypingIndicator or muted text), success (title "Correo confirmado", text with the email, button "Ir a mis rutas" when `isAccount`, else "Entrar" → `/login`; call `refreshSession()` on success), expired (`TOKEN_EXPIRED`: title "El enlace ha caducado", button "Reenviar correo" when `isAccount` and unverified, else "Entrar"), invalid (`INVALID_TOKEN` or missing token: title "Este enlace no es válido", button "Ir al inicio"). |
| `/auth/callback` | `AuthCallbackPage` | Public, outside `GuestOnArrival`. Reads `window.location.hash`; `data.completeSignIn(hash)`; reads and clears `rt.auth.return`; success → `afterSignIn(session, returnState)`; `error=access_denied` → navigate `/login` with toast "Has cancelado el acceso"; other errors → title "No se ha podido entrar", text from the error, buttons "Volver a intentarlo" (`/login`) and "Ir al inicio". Shows "Entrando…" while working. |

`VerifyEmailNotice` (`components/VerifyEmailNotice`): a `Card` with text "Confirma tu correo para proteger tu cuenta." and a text button "Reenviar correo"; rendered at the top of `ProfilePage` (account variant) and `AccountPage` when `session.kind === 'account' && session.emailVerified === false`. Uses the same resend handler (extract `useResendVerification()` hook: busy flag, toasts, rate-limit message).

### 5.6 Data modules

`httpData.ts`:

- `status` result type gains `auth: { providers: AuthProvider[]; mail: boolean }` and `account.emailVerified`. `asSession(account, auth)` sets `emailVerified: auth.mail ? account.emailVerified : undefined`. Cache the last `auth` object in module scope so `signIn` responses (which carry no `auth`) can reuse it; `getSession` refreshes it.
- `verifyEmail: token => call('verifyEmail', 'POST', { token })`.
- `resendVerification: () => call('resendVerification', 'POST', {})`.
- `authProviders: async () => (await status()).auth.providers` (reuse cached `auth` when already loaded).
- `signInWith`: `const { url, state } = await call('oauthStart', 'POST', { provider })`; `sessionStorage.setItem(prefix + '.oauthState', state)`; `window.location.assign(url)`; `return new Promise(() => {})`. Inject `location`/`sessionStorage` through the factory options so tests can observe the redirect (`createHttpDataModule(endpoint, storage, { session: sessionStorage, navigate: url => … })`).
- `completeSignIn(fragment)`: parse `new URLSearchParams(fragment.replace(/^#/, ''))`; `error` → throw `ApiClientError(message, error.toUpperCase(), 400)`; `state` must equal and then clear the stored one, else throw `INVALID_STATE`; `call('oauthExchange', 'POST', { ticket })` → store token, remove guest key, return `asSession`.

`mockData.ts`:

- `register`: throws `EMAIL_EXISTS` for an email already in `rt.accounts`; stores the email; session gets `emailVerified: false`; stores a token `demo-<random 8 hex>` under `rt.verifyToken` and `console.info('[demo] Enlace de verificación: /verify-email?token=…')` (only `import.meta.env.DEV`).
- `login`: `emailVerified: true` (existing accounts), as do the fake Google/Apple sessions.
- `verifyEmail(token)`: matches `rt.verifyToken` → set `emailVerified: true` on the session, clear the token, return `{ email }`; otherwise throw `INVALID_TOKEN`.
- `resendVerification`: rotates the demo token; resolves.
- `authProviders`: `['google', 'apple']`.
- `signInWith(provider)`: `login(provider === 'google' ? 'google@ejemplo.com' : 'apple@ejemplo.com', 'mock-oauth')` (moves the two fake emails out of `es.json` into the data module; delete the `auth.googleEmail/appleEmail` keys).
- `completeSignIn`: throws `ApiClientError('Sin backend', 'NOT_SUPPORTED', 400)`.
- `updateAccount` and `deleteAccount` keep `emailVerified` consistent (copy on update, clear on delete).

### 5.7 Router

Add `/verify-pending` (inside `RequireAccount fallback="/login"`), `/verify-email`, `/auth/callback`. The last two are plain routes (no guards).

### 5.8 i18n (`es.json`)

Update `auth.passwordPlaceholder`, `auth.errorPassword`; add `auth.show`, `auth.hide`, `auth.errorEmailExists`, `auth.errorCredentials`, `auth.errorRateLimited`, `auth.errorGeneric`, `auth.reason.PASSWORD_TOO_SHORT|TOO_LONG|TOO_SIMPLE|CONTAINS_EMAIL|COMMON`, the `verify.*`, `oauth.*` and `toast.verificationSent`, `toast.verificationThrottled`, `toast.oauthCancelled` keys. Remove `auth.googleEmail`, `auth.appleEmail`. No hard-coded user-facing strings in components.

## 6. Security checklist (reviewer verifies each)

1. Verification tokens, OAuth states and login tickets are stored hashed, expire, and are single use (`DELETE … RETURNING`).
2. `login` never distinguishes "no account", "OAuth-only account" and "wrong password" in message or timing.
3. `oauthCallback` validates `state` (DB), `nonce` (id_token claim), `iss`, `aud`, `exp` (via `jose`) and, for Google, PKCE; Apple's `client_secret` JWT lives ≤ 5 minutes.
4. Google identities require `email_verified === true`; identities are keyed by `sub`, never by email alone.
5. The `Origin` allow-list is bypassed **only** for `oauthCallback`; every JSON action keeps it.
6. The ticket travels in the URL fragment; the frontend compares `state` before exchanging; `returnTo` is restricted to same-origin paths.
7. Rate limits on `register`/`login` (existing), `oauthStart`, `oauthExchange`, `verifyEmail` (per network) and `resendVerification` (per account).
8. No token, code, ticket, password or email is logged; errors log `code ?? name` only (existing convention).
9. Outbound `fetch` calls (Resend, token endpoints, JWKS) use `AbortSignal.timeout(8_000)` and treat non-2xx as failures.
10. `APP_URL`/`PUBLIC_API_URL` come from env (or the request's own origin), never from client input.

## 7. Tests

### Backend (`node --test`, PGlite)

`test/auth.test.js` (new; set `APP_URL`, `MAIL_FROM`, `RESEND_API_KEY=test`, Google and Apple env vars in `before`; `APPLE_PRIVATE_KEY` from `jose.generateKeyPair('ES256')` exported as PKCS#8):

1. Password rules: each reason returns 400 with `details.field === 'password'` and the right `reason`; a 12-char strong password registers (201).
2. Register sends mail: mock `fetch` for `api.resend.com`, capture the body, extract the token from the link, `status` shows `emailVerified: false`, `verifyEmail` → 200 and `status` → `true`; the same token again → 400 `INVALID_TOKEN`; a token aged past 24 h (update `expires_at` in SQL) → 410.
3. `resendVerification`: 204, 204, 204, then 429; after verification → 409.
4. `checkout` on an unverified account → 403 `EMAIL_NOT_VERIFIED` (with Stripe env set so the test does not hit 503 first).
5. `oauthStart` google: 200 `{url, state}`; URL has `client_id`, `redirect_uri` ending in `?action=oauthCallback`, `state`, `nonce`, `code_challenge_method=S256`. Unknown provider → 400; unconfigured provider (unset env in a sub-test) → 503.
6. Google callback end-to-end: mocked `fetch` answers the token endpoint with an id_token signed by a test RS256 key (`SignJWT`, claims `iss`, `aud`, `sub`, `email`, `email_verified: true`, `nonce` read from the authorize URL) and the JWKS endpoint with that key; GET `oauthCallback?code=x&state=<state>` with no `Origin` → 302 whose `Location` is `${APP_URL}/auth/callback#state=…&ticket=…`; `oauthExchange {ticket}` with `X-Guest-Token` → 200 account with `emailVerified: true`; the ticket a second time → 400; signing in again with the same `sub` returns the same account id; a `sub` whose email matches an existing password account links to it (same id, now verified).
7. Apple callback: POST `application/x-www-form-urlencoded` body `code&state` with `Origin: https://appleid.apple.com` → accepted (302), `email_verified: 'true'` string accepted; the mocked token request carries a `client_secret` that `jwtVerify`s with the test ES256 public key and has `iss = team`, `aud = https://appleid.apple.com`.
8. Bad/expired/reused `state` → 302 with `error=invalid_state`; provider `error=access_denied` → 302 with `error=access_denied`; wrong nonce → `error=invalid_token`.
9. Password login on an OAuth-only account → 401 `INVALID_CREDENTIALS`.
10. `common-passwords.json` identical in `backend/lib` and `frontend/src/lib`.
11. `applySchema` twice is idempotent (already covered by `api.test.js` loading the migration twice; switch it to `applySchema`).

`test/frontend-contract.test.js`: register through the adapter → `getSession()` has `emailVerified: false`; link captured from mocked mail → `data.verifyEmail(token)` → `getSession().emailVerified === true`; `authProviders()` → `[]` without env, `['google']` with Google env; `signInWith('google')` with an injected `navigate` records a URL on the Google host and stores the state; `completeSignIn('#state=wrong&ticket=x')` rejects with `INVALID_STATE`.

### Frontend (vitest + Testing Library)

`src/auth.test.tsx` (new): register form shows the live hint, blocks a 10-char password with the "12 caracteres" message, a password containing the email with its message; a mocked data module rejecting with `EMAIL_EXISTS` shows the email field error; successful register lands on `/verify-pending` showing the email, "Continuar" goes to `/my-routes`; `/verify-email?token=<demo>` on the mock module shows "Correo confirmado" and the Perfil notice disappears; invalid token shows the invalid state; `authProviders` returning `[]` hides both buttons and the divider; Google button on the mock module ends in `/my-routes` as an account; `/auth/callback#state=s&ticket=t` with a data module whose `completeSignIn` resolves navigates to the stored `returnTo`; `#error=access_denied` returns to `/login`.

`feature2.test.tsx`: update the two flows that register (guest save now stops at `/verify-pending`; "Continuar" reaches `/my-routes/:id`) and any password fixtures shorter than 12 chars. `App.test.tsx` and `mockData.test.ts` adjust for the session shape.

Commands that must pass before review and again before merge: `cd backend && npm test`, `cd frontend && npm run check && npm test && npm run build`.

## 8. Delivery

1. Work in the worktree `/home/hackerman/Documents/cacahuetes/.claude/worktrees/feature-auth` on `feature/auth-validation` (forked from `dev`, dependencies installed). Never touch the main checkout or the `dev` worktree.
2. Commit in logical steps (schema + password rules; mail + verification; OAuth backend; frontend contract + data modules; frontend screens; docs/env). Each commit message ends with the attribution line given in the session.
3. Push the branch: `git push -u origin feature/auth-validation`.
4. Review (second agent) against this spec and §6; fix findings; re-run all four commands.
5. Merge into `dev`: `git fetch origin && git merge origin/dev` on the feature branch (resolve conflicts, keeping both the backend's newer code and this feature), re-run all four commands, then `git push origin HEAD:dev` (fast-forward only; never force) and `git push origin feature/auth-validation`. If `.claude/worktrees/dev` is clean, `git -C ../dev pull --ff-only`.
6. Report: commits, test output summary, env vars the deployer must set, and anything left out.

## 9. Acceptance criteria

- A 10-character password is refused by the form before any request; an 11-character one that reaches the server (e.g. via the adapter) gets 400 with `reason: PASSWORD_TOO_SHORT`; a wrong login shows "Correo o contraseña incorrectos." under the form instead of silently failing.
- Registering with the real backend sends one email containing a link; opening it marks the account verified; the notice disappears from Perfil and Cuenta; a second click says the link is invalid; a link older than 24 h says it expired and offers to resend.
- "Continuar con Google" / "Continuar con Apple" appear only when the deployment has the keys; completing the provider flow signs the user in, claims any guest draft, and returns them to where they started (including saving a pending route); cancelling at the provider returns to Entrar with a toast.
- The standalone demo (no `VITE_CACAHUETE_API_URL`) still works end to end: register → Confirma tu correo → demo link in the console verifies → Google/Apple fake sign-in unchanged.
- `dev` contains the merged feature, all tests pass there, and `main` is untouched.
