/* Confirma tu correo (undesigned, feature 4): shown once right after registering. */
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Header, Mascot, Screen } from '../components'
import { t } from '../i18n'
import { useResendVerification } from '../lib/useResendVerification'
import { useSession } from '../state/AppState'
import { safeReturnTo } from './auth/afterSignIn'
import layout from './layout.module.css'

export function VerifyPendingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useSession()
  const { resend, busy } = useResendVerification()
  const returnTo = safeReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo) ?? '/my-routes'

  if (session.emailVerified !== false) return <Navigate to={returnTo} replace />

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header label={t('verify.pendingHeader')} className={layout.header} />
        <div className={layout.center}>
          <Mascot size={72} />
          <div className={layout.titleBlock}>
            <h1 className={layout.h1}>{t('verify.pendingTitle')}</h1>
            <p className={layout.subtitle}>{t('verify.pendingText', { email: session.email ?? '' })}</p>
          </div>
        </div>
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={busy} onClick={() => void resend()}>
          {t('verify.resend')}
        </Button>
        <button type="button" className={layout.textAction} onClick={() => navigate(returnTo, { replace: true })}>
          {t('verify.continue')}
        </button>
      </div>
    </Screen>
  )
}
