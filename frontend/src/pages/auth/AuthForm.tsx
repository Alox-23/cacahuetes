/* Crear cuenta (Registro.html) and Entrar (Login.html): one form, two modes. Mock auth, client-side checks. */
import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AuthProvider } from '../../contract/types'
import { Button, Checkbox, Header, Screen, TextField } from '../../components'
import { t } from '../../i18n'
import { useBack } from '../../lib/useBack'
import { hasPassword, isValidEmail, passwordProblem } from '../../lib/validation'
import { useData, useSession, useToast } from '../../state/AppState'
import layout from '../layout.module.css'
import styles from './AuthForm.module.css'

/** Router state passed by "Guardar como invitado" (and kept when switching forms). */
export type AuthState = { returnTo?: string; saveRouteId?: string } | null

type Mode = 'register' | 'login'
type Errors = { email?: string; password?: string; terms?: string }

function validate(mode: Mode, email: string, password: string, terms: boolean): Errors {
  const errors: Errors = {}
  if (!isValidEmail(email)) errors.email = t('auth.errorEmail')
  if (mode === 'register') {
    const reason = passwordProblem(password, email)
    if (reason) errors.password = t(`auth.reason.${reason}`)
  } else if (!hasPassword(password)) errors.password = t('auth.errorPassword')
  if (mode === 'register' && !terms) errors.terms = t('auth.errorTerms')
  return errors
}

export function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as AuthState) ?? null
  const data = useData()
  const { refreshSession } = useSession()
  const toast = useToast()
  const back = useBack('/')
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

  async function enter(how: 'form' | AuthProvider, address = '', secret = '') {
    setBusy(true)
    try {
      if (how !== 'form') await data.signInWith(how)
      else if (register) await data.register(address.trim(), secret)
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
          <div className={styles.oauth}>
            <button type="button" className={styles.oauthButton} disabled={busy} onClick={() => void enter('google')}>
              {t('auth.google')}
            </button>
            <button type="button" className={styles.oauthButton} disabled={busy} onClick={() => void enter('apple')}>
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
        </div>
        <div className={`${layout.footer} ${layout.footerTight} ${styles.footer}`}>
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
