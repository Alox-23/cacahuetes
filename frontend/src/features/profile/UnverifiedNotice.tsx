/* "Confirma tu correo" notice (feature 4 §5.5) for an unverified account: Perfil, Cuenta and the desktop settings tabs. */
import { VerifyEmailNotice } from '../../components'
import { useResendVerification } from '../../lib/useResendVerification'
import { useSession } from '../../state/AppState'

export function UnverifiedNotice() {
  const { session } = useSession()
  const verification = useResendVerification()
  if (session.kind !== 'account' || session.emailVerified !== false) return null
  return <VerifyEmailNotice busy={verification.busy} onResend={() => void verification.resend()} />
}
