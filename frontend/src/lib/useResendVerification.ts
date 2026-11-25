import { useCallback, useState } from 'react'
import { isApiError } from '../data/errors'
import { t } from '../i18n'
import { useData, useSession, useToast } from '../state/AppState'

/** "Reenviar correo": busy flag, toasts and the rate-limit message (feature 4). */
export function useResendVerification() {
  const data = useData()
  const { refreshSession } = useSession()
  const { show } = useToast()
  const [busy, setBusy] = useState(false)
  const resend = useCallback(async () => {
    setBusy(true)
    try {
      await data.resendVerification()
      show(t('toast.verificationSent'))
    } catch (error) {
      // Confirmed meanwhile (another tab): refreshing hides the prompts.
      if (isApiError(error, 'ALREADY_VERIFIED')) await refreshSession().catch(() => undefined)
      else show(isApiError(error, 'RATE_LIMITED') ? t('toast.verificationThrottled') : t('toast.verificationFailed'))
    } finally {
      setBusy(false)
    }
  }, [data, refreshSession, show])
  return { resend, busy }
}
