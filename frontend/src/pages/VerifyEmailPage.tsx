/* Correo confirmado (undesigned, feature 4): the link from the verification email lands here. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Dialog, Header, Mascot, Screen } from '../components'
import { isApiError } from '../data/errors'
import { t } from '../i18n'
import { useResendVerification } from '../lib/useResendVerification'
import { useData, useSession } from '../state/AppState'
import layout from './layout.module.css'

type Outcome =
  | { status: 'loading' }
  | { status: 'done'; email: string }
  | { status: 'expired' }
  | { status: 'invalid' }

/** `background`: desktop only, the view kept behind the dialog (feature 3 desktop); Esc returns there. */
export function VerifyEmailPage({ background }: { background?: string }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const data = useData()
  const { session, isAccount, refreshSession } = useSession()
  const { resend, busy } = useResendVerification()
  const [outcome, setOutcome] = useState<Outcome>(token ? { status: 'loading' } : { status: 'invalid' })
  // Links are single use: StrictMode's second effect run must reuse the first request.
  const attempts = useRef(new Map<string, Promise<{ email: string }>>())

  useEffect(() => {
    if (!token) return
    let alive = true
    let attempt = attempts.current.get(token)
    if (!attempt) {
      attempt = data.verifyEmail(token)
      attempts.current.set(token, attempt)
    }
    attempt
      .then(async ({ email }) => {
        await refreshSession().catch(() => undefined)
        if (alive) setOutcome({ status: 'done', email })
      })
      .catch((error: unknown) => {
        if (alive) setOutcome(isApiError(error, 'TOKEN_EXPIRED') ? { status: 'expired' } : { status: 'invalid' })
      })
    return () => {
      alive = false
    }
  }, [token, data, refreshSession])

  const login = (
    <Button fullWidth to="/login" replace>
      {t('verify.login')}
    </Button>
  )
  const view = {
    loading: { title: undefined, text: t('verify.checking'), action: null },
    done: {
      title: t('verify.doneTitle'),
      text: outcome.status === 'done' ? t('verify.doneText', { email: outcome.email }) : '',
      action: isAccount ? (
        <Button fullWidth to="/my-routes" replace>
          {t('verify.toMyRoutes')}
        </Button>
      ) : (
        login
      ),
    },
    expired: {
      title: t('verify.expiredTitle'),
      text: t('verify.expiredText'),
      action:
        isAccount && session.emailVerified === false ? (
          <Button fullWidth disabled={busy} onClick={() => void resend()}>
            {t('verify.resend')}
          </Button>
        ) : (
          login
        ),
    },
    invalid: {
      title: t('verify.invalidTitle'),
      text: t('verify.invalidText'),
      action: (
        <Button fullWidth to="/" replace>
          {t('verify.home')}
        </Button>
      ),
    },
  }[outcome.status]

  if (background !== undefined) {
    return (
      <Dialog title={view.title ?? t('verify.header')} description={view.text} onClose={() => navigate(background, { replace: true })}>
        {view.action && <div className={layout.dialogActions}>{view.action}</div>}
      </Dialog>
    )
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header label={t('verify.header')} className={layout.header} />
        <div className={layout.center}>
          <Mascot size={72} />
          <div className={layout.titleBlock} role={outcome.status === 'loading' ? 'status' : undefined}>
            {view.title && <h1 className={layout.h1}>{view.title}</h1>}
            <p className={view.title ? layout.subtitle : layout.muted}>{view.text}</p>
          </div>
        </div>
      </div>
      {view.action && <div className={layout.footer}>{view.action}</div>}
    </Screen>
  )
}
