/* Entrando… (undesigned, feature 4): the backend sends the provider sign-in back here (#state=…&ticket=…). */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Header, Mascot, Screen } from '../components'
import type { Session } from '../contract/types'
import { isApiError } from '../data/errors'
import { t, type TranslationKey } from '../i18n'
import { useData, useToast } from '../state/AppState'
import { takeReturn, useAfterSignIn, type AuthState } from './auth/afterSignIn'
import layout from './layout.module.css'

const ERROR_TEXT: Record<string, TranslationKey> = {
  INVALID_STATE: 'oauth.errorExpired',
  INVALID_TICKET: 'oauth.errorExpired',
  EMAIL_UNVERIFIED: 'oauth.errorUnverified',
  PROVIDER_UNAVAILABLE: 'oauth.errorUnavailable',
}

export function AuthCallbackPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const data = useData()
  const { show } = useToast()
  const afterSignIn = useAfterSignIn()
  const [error, setError] = useState<string | null>(null)
  // The state check and the ticket are single use: StrictMode's second effect run reuses the first attempt.
  const attempt = useRef<{ result: Promise<Session>; returnState: AuthState; handled: boolean } | null>(null)

  useEffect(() => {
    if (!attempt.current) {
      attempt.current = { result: data.completeSignIn(hash), returnState: takeReturn(), handled: false }
    }
    const current = attempt.current
    const { result, returnState } = current
    let alive = true
    // Only the live effect acts, and only once (a re-run after the outcome must not sign in twice).
    const claim = () => {
      if (!alive || current.handled) return false
      current.handled = true
      return true
    }
    result.then(
      (session) => {
        if (claim()) afterSignIn(session, returnState, false).catch(() => setError(t('oauth.errorText')))
      },
      (reason: unknown) => {
        if (!claim()) return
        if (isApiError(reason, 'ACCESS_DENIED')) {
          show(t('toast.oauthCancelled'))
          navigate('/login', { replace: true, state: returnState })
          return
        }
        const key = isApiError(reason) ? ERROR_TEXT[reason.code] : undefined
        setError(t(key ?? 'oauth.errorText'))
      },
    )
    return () => {
      alive = false
    }
  }, [data, hash, afterSignIn, navigate, show])

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header label={t('auth.loginHeader')} className={layout.header} />
        <div className={layout.center}>
          <Mascot size={72} />
          {error ? (
            <div className={layout.titleBlock}>
              <h1 className={layout.h1}>{t('oauth.errorTitle')}</h1>
              <p className={layout.subtitle}>{error}</p>
            </div>
          ) : (
            <p className={layout.muted} role="status">
              {t('oauth.working')}
            </p>
          )}
        </div>
      </div>
      {error && (
        <div className={layout.footer}>
          <Button fullWidth to="/login" replace>
            {t('oauth.retry')}
          </Button>
          <Button fullWidth variant="secondary" className={layout.secondaryButton} to="/" replace>
            {t('oauth.home')}
          </Button>
        </div>
      )}
    </Screen>
  )
}
