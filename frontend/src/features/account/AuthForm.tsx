/* Crear cuenta / Entrar form (Registro.html, Login.html): dev's fields, checks and mock sign-in, layout-agnostic. */
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, TextField } from '../../components'
import { t } from '../../i18n'
import { isValidEmail, isValidPassword } from '../../lib/validation'
import { useData, useSession, useToast } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import styles from './AuthForm.module.css'

/** Router state passed by "Guardar como invitado" (and kept when switching forms); `background` is the desktop view behind the dialog. */
export type AuthState = { returnTo?: string; saveRouteId?: string; background?: string } | null

export type AuthMode = 'register' | 'login'
type Errors = { email?: string; password?: string; terms?: string }

/** Mock sign-in password for the Google/Apple buttons (not shown anywhere). */
const OAUTH_PASSWORD = 'mock-oauth'

function validate(mode: AuthMode, email: string, password: string, terms: boolean): Errors {
  const errors: Errors = {}
  if (!isValidEmail(email)) errors.email = t('auth.errorEmail')
  if (!isValidPassword(password)) errors.password = t('auth.errorPassword')
  if (mode === 'register' && !terms) errors.terms = t('auth.errorTerms')
  return errors
}

type AuthFormProps = {
  mode: AuthMode
  state: AuthState
  /** "¿Ya tienes cuenta? Entrar" / "¿No tienes cuenta? Crear una". */
  onSwitch: () => void
  layout?: 'mobile' | 'desktop'
  /** Mobile: header and titles at the top of the scrolling body. */
  top?: ReactNode
  submitLabel?: string
  switchLabel?: string
}

export function AuthForm({ mode, state, onSwitch, layout: where = 'mobile', top, submitLabel, switchLabel }: AuthFormProps) {
  const navigate = useNavigate()
  const data = useData()
  const { refreshSession } = useSession()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLInputElement>(null)

  const errors = submitted ? validate(mode, email, password, terms) : {}
  const register = mode === 'register'

  async function enter(how: 'form' | 'oauth', address: string, secret: string) {
    setBusy(true)
    try {
      // The Google/Apple mocks are an "existing account": they go through login (seeds the examples).
      if (how === 'form' && register) await data.register(address.trim(), secret)
      else await data.login(address.trim(), secret)
      if (state?.saveRouteId) {
        try {
          await data.saveRoute(state.saveRouteId)
          toast.show(t('toast.routeSaved'))
        } catch {
          // The route may have been removed meanwhile; the account still works.
        }
      }
      await refreshSession()
      navigate(state?.returnTo ?? '/my-routes', { replace: true })
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
    void enter('form', email, password)
  }

  const fields = (
    <>
      <div className={styles.oauth}>
        <button type="button" className={styles.oauthButton} disabled={busy} onClick={() => void enter('oauth', t('auth.googleEmail'), OAUTH_PASSWORD)}>
          {t('auth.google')}
        </button>
        <button type="button" className={styles.oauthButton} disabled={busy} onClick={() => void enter('oauth', t('auth.appleEmail'), OAUTH_PASSWORD)}>
          {t('auth.apple')}
        </button>
      </div>
      <div className={styles.divider}>
        <span className={styles.line} />
        <span>{t('auth.divider')}</span>
        <span className={styles.line} />
      </div>
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
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        type="password"
        autoComplete={register ? 'new-password' : 'current-password'}
        placeholder={register ? t('auth.passwordPlaceholder') : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      {register ? (
        <Checkbox ref={termsRef} label={t('auth.terms')} checked={terms} onChange={(e) => setTerms(e.target.checked)} error={errors.terms} />
      ) : (
        <button type="button" className={`${layout.textAction} ${layout.start} ${styles.forgot}`} onClick={() => toast.show(t('toast.pending'))}>
          {t('auth.forgot')}
        </button>
      )}
    </>
  )
  const actions = (
    <>
      <Button type="submit" fullWidth disabled={busy}>
        {submitLabel ?? (register ? t('auth.registerSubmit') : t('auth.loginSubmit'))}
      </Button>
      <button type="button" className={layout.textAction} onClick={onSwitch}>
        {switchLabel ?? (register ? t('auth.toLogin') : t('auth.toRegister'))}
      </button>
    </>
  )

  if (where === 'desktop') {
    return (
      <form className={styles.desktopForm} onSubmit={onSubmit} noValidate>
        {fields}
        {actions}
      </form>
    )
  }
  return (
    <form className={layout.form} onSubmit={onSubmit} noValidate>
      <div className={`${layout.body} ${layout.gap18}`}>
        {top}
        {fields}
      </div>
      <div className={`${layout.footer} ${layout.footerTight} ${styles.footer}`}>{actions}</div>
    </form>
  )
}
