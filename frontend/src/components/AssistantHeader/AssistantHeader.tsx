import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { BackIcon } from '../icons/icons'
import { Mascot } from '../Mascot/Mascot'
import styles from './AssistantHeader.module.css'

type AssistantHeaderProps = {
  backTo?: string
  onBack?: () => void
  onSkip?: () => void
  className?: string
}

/** Chat header: mascot, "Cacahuete" / "Asistente de IA", optional back and "Omitir". */
export function AssistantHeader({ backTo, onBack, onSkip, className }: AssistantHeaderProps) {
  const hasBack = backTo !== undefined || Boolean(onBack)
  return (
    <header className={cx(styles.wrap, className)}>
      <div className={cx(styles.row, hasBack && styles.withBack)}>
        {backTo !== undefined ? (
          <Link to={backTo} aria-label={t('common.back')} className={styles.back}>
            <BackIcon />
          </Link>
        ) : onBack ? (
          <button type="button" aria-label={t('common.back')} className={styles.back} onClick={onBack}>
            <BackIcon />
          </button>
        ) : null}
        <Mascot size={hasBack ? 34 : 38} />
        <div className={styles.names}>
          <span className={styles.name}>{t('assistant.name')}</span>
          <span className={styles.role}>{t('assistant.role')}</span>
        </div>
        {onSkip && (
          <button type="button" className={styles.skip} onClick={onSkip}>
            {t('common.skip')}
          </button>
        )}
      </div>
    </header>
  )
}
