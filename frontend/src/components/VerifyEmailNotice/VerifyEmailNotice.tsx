import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { Card } from '../Card/Card'
import styles from './VerifyEmailNotice.module.css'

type VerifyEmailNoticeProps = {
  onResend: () => void
  busy?: boolean
  className?: string
}

/** Feature 4: nudge shown to accounts whose email is not confirmed yet (Perfil, Cuenta). */
export function VerifyEmailNotice({ onResend, busy = false, className }: VerifyEmailNoticeProps) {
  return (
    <Card padding="14px 16px" className={cx(styles.notice, className)} role="note">
      <p className={styles.text}>{t('verify.notice')}</p>
      <button type="button" className={styles.action} disabled={busy} onClick={onResend}>
        {t('verify.resend')}
      </button>
    </Card>
  )
}
