/* Crear cuenta (Registro.html) and Entrar (Login.html): one form, two modes. Rules shared with the server. */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Checkbox, Header, Screen, TextField } from '../../components'
import type { AuthProvider, Session } from '../../contract/types'
import { isApiError } from '../../data/errors'
import { t, type TranslationKey } from '../../i18n'
import { useBack } from '../../lib/useBack'
import { hasPassword, isValidEmail, passwordProblem, type PasswordReason } from '../../lib/validation'
import { useData, useToast } from '../../state/AppState'
import layout from '../layout.module.css'
import { rememberReturn, useAfterSignIn, type AuthState } from './afterSignIn'
import styles from './AuthForm.module.css'

type Mode = 'register' | 'login'
type Errors = { email?: string; password?: string; terms?: string }
/** Errors reported by the data module (server or mock), shown until the field changes. */
type ServerErrors = { email?: string; password?: string; form?: string }

const PASSWORD_REASONS: readonly PasswordReason[] = [
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_TOO_SIMPLE',
  'PASSWORD_CONTAINS_EMAIL',
  'PASSWORD_COMMON',
]

const reasonText = (reason: PasswordReason) => t(`auth.reason.${reason}`)

function validate(mode: Mode, email: string, password: string, terms: boolean): Errors {
  const errors: Errors = {}
  if (!isValidEmail(email)) errors.email = t('auth.errorEmail')
  if (mode === 'register') {
    const reason = passwordProblem(password, email)
    if (reason) errors.password = reasonText(reason)
  } else if (!hasPassword(password)) errors.password = t('auth.errorPassword')
  if (mode === 'register' && !terms) errors.terms = t('auth.errorTerms')
  return errors
}

/** Field or form message for a rejected register/login/provider call. */
function serverErrors(error: unknown): ServerErrors {
  if (isApiError(error, 'INVALID_INPUT')) {
    const { field, reason } = error.details
    const known = PASSWORD_REASONS.find((r) => r === reason)
    if (field === 'password') return { password: known ? reasonText(known) : error.message }
    if (field === 'email') return { email: reason === 'EMAIL_INVALID' ? t('auth.errorEmail') : error.message }
  }
  if (isApiError(error, 'EMAIL_EXISTS')) return { email: t('auth.errorEmailExists') }
  const formKeys: Record<string, TranslationKey> = {
    INVALID_CREDENTIALS: 'auth.errorCredentials',
    RATE_LIMITED: 'auth.errorRateLimited',
    PROVIDER_UNAVAILABLE: 'oauth.errorUnavailable',
  }
  const key = isApiError(error) ? formKeys[error.code] : undefined
  return { form: t(key ?? 'auth.errorGeneric') }
}

/** Providers configured for this deployment ([] while loading or when none). */
function useAuthProviders(): AuthProvider[] {
  const data = useData()
  const [providers, setProviders] = useState<AuthProvider[]>([])
  useEffect(() => {
    let alive = true
    data
      .authProviders()
      .then((list) => alive && setProviders(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [data])
  return providers
}

export function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as AuthState) ?? null
  const data = useData()
  const afterSignIn = useAfterSignIn()
  const toast = useToast()
  const providers = useAuthProviders()
  const back = useBack('/')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [terms, setTerms] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState<ServerErrors>({})
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLInputElement>(null)

  const register = mode === 'register'
  const errors = submitted ? validate(mode, email, password, terms) : {}
  // Register: after the first keystroke, a muted line with the first unmet rule (an error after submit).
  const reason = register && password.length > 0 ? passwordProblem(password, email) : null
  const passwordHint = !submitted && reason ? reasonText(reason) : undefined

  async function enter(how: 'form' | AuthProvider) {
    setBusy(true)
    setServer({})
    try {
      let session: Session
      if (how !== 'form') {
        // A backend navigates away to the provider here (the promise never settles); the demo resolves.
        rememberReturn(state)
        session = await data.signInWith(how)
      } else if (register) session = await data.register(email.trim(), password)
      else session = await data.login(email.trim(), password)
      await afterSignIn(session, state, how === 'form' && register)
    } catch (error) {
      const found = serverErrors(error)
      setServer(found)
      if (found.email) emailRef.current?.focus()
      else if (found.password) passwordRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    const found = validate(mode, email, password, terms)
    const first = found.email ? emailRef.current : found.password ? passwordRef.current : found.terms ? termsRef.current : null
    if (first) {
      // Focus the first invalid field and keep its error (below it) in view.
      first.focus()
      first.parentElement?.scrollIntoView?.({ block: 'center' })
      return
    }
    void enter('form')
  }

  return (
    <Screen fixed className={layout.page}>
      <form className={layout.form} onSubmit={onSubmit} noValidate>
        <div className={`${layout.body} ${layout.gap18}`}>
          <Header onBack={back} label={register ? t('auth.registerHeader') : t('auth.loginHeader')} className={layout.header} />
          <div className={layout.titleBlock}>
            <h1 className={layout.h1}>{register ? t('auth.registerTitle') : t('auth.loginTitle')}</h1>
            <p className={layout.subtitle}>{register ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</p>
          </div>
          <div className={layout.spacer} />
          {providers.length > 0 && (
            <>
              <div className={styles.oauth}>
                {providers.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className={styles.oauthButton}
                    disabled={busy}
                    onClick={() => void enter(provider)}
                  >
                    {provider === 'google' ? t('auth.google') : t('auth.apple')}
                  </button>
                ))}
              </div>
              <div className={styles.divider}>
                <span className={styles.line} />
                <span>{t('auth.divider')}</span>
                <span className={styles.line} />
              </div>
            </>
          )}
          <TextField
            ref={emailRef}
            label={t('auth.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setServer((s) => ({ ...s, email: undefined }))
            }}
            error={errors.email ?? server.email}
          />
          <TextField
            ref={passwordRef}
            label={t('auth.password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete={register ? 'new-password' : 'current-password'}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={register ? t('auth.passwordPlaceholder') : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setServer((s) => ({ ...s, password: undefined }))
            }}
            error={errors.password ?? server.password}
            hint={passwordHint}
            trailing={
              <button
                type="button"
                className={styles.reveal}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? t('auth.hide') : t('auth.show')}
              </button>
            }
          />
          {register ? (
            <Checkbox ref={termsRef} label={t('auth.terms')} checked={terms} onChange={(e) => setTerms(e.target.checked)} error={errors.terms} />
          ) : (
            <button type="button" className={`${layout.textAction} ${layout.start} ${styles.forgot}`} onClick={() => toast.show(t('toast.pending'))}>
              {t('auth.forgot')}
            </button>
          )}
        </div>
        <div className={`${layout.footer} ${layout.footerTight} ${styles.footer}`}>
          {server.form && (
            <p role="alert" className={styles.formError}>
              {server.form}
            </p>
          )}
          <Button type="submit" fullWidth disabled={busy}>
            {register ? t('auth.registerSubmit') : t('auth.loginSubmit')}
          </Button>
          <button
            type="button"
            className={layout.textAction}
            onClick={() => navigate(register ? '/login' : '/register', { state, replace: true })}
          >
            {register ? t('auth.toLogin') : t('auth.toRegister')}
          </button>
        </div>
      </form>
    </Screen>
  )
}
