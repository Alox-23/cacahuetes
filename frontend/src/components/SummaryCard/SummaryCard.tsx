import { Link } from 'react-router-dom'
import type { Preferences, RouteRequest } from '../../contract/types'
import { messageChips, preferenceSummaryChips } from '../../assistant/format'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { Button } from '../Button/Button'
import { Chip } from '../Chip/Chip'
import styles from './SummaryCard.module.css'

type SummaryCardProps = {
  request: RouteRequest
  preferences: Preferences | null
  /** "Crear ruta"; omitted on older summaries in the transcript. */
  onCreate?: () => void
  /** "Cambiar" next to the preferences group; defaults to a link to /preferences. */
  onChangePreferences?: () => void
  className?: string
}

/** "Esto es lo que entendí": message data and saved preferences in two groups. */
export function SummaryCard({ request, preferences, onCreate, onChangePreferences, className }: SummaryCardProps) {
  const fromMessage = messageChips(request)
  const fromPrefs = preferenceSummaryChips(preferences, request)
  return (
    <div className={cx(styles.card, className)}>
      <h2 className={styles.title}>{t('summary.title')}</h2>
      <section className={styles.group} aria-label={t('summary.fromMessage')}>
        <span className={styles.groupTitle}>{t('summary.fromMessage')}</span>
        <div className={styles.chips}>
          {fromMessage.map((c, i) => (
            <Chip key={`${c}-${i}`}>{c}</Chip>
          ))}
        </div>
      </section>
      <section className={styles.group} aria-label={t('summary.fromPreferences')}>
        <div className={styles.groupHeader}>
          <span className={styles.groupTitle}>{t('summary.fromPreferences')}</span>
          {onChangePreferences ? (
            <button type="button" className={styles.change} onClick={onChangePreferences}>
              {t('common.change')}
            </button>
          ) : (
            <Link to="/preferences" className={styles.change}>
              {t('common.change')}
            </Link>
          )}
        </div>
        <div className={styles.chips}>
          {fromPrefs.length > 0 ? fromPrefs.map((c, i) => <Chip key={`${c}-${i}`}>{c}</Chip>) : <span className={styles.muted}>{t('summary.noPreferences')}</span>}
        </div>
      </section>
      {onCreate && (
        <>
          <Button fullWidth onClick={onCreate}>
            {t('summary.create')}
          </Button>
          <span className={styles.muted}>{t('summary.hint')}</span>
        </>
      )}
    </div>
  )
}
