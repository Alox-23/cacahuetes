import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { StarIcon } from '../icons/icons'
import styles from './StarRating.module.css'

type StarRatingProps = {
  value: number
  onChange: (stars: number) => void
  /** Accessible name of the group. */
  label: string
  max?: number
  className?: string
}

/** Five 52 px star buttons with 40 px stars; each is a toggle "N de 5". */
export function StarRating({ value, onChange, label, max = 5, className }: StarRatingProps) {
  return (
    <div role="group" aria-label={label} className={cx(styles.group, className)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const on = n <= value
        return (
          <button
            key={n}
            type="button"
            aria-label={t('rate.star', { n })}
            aria-pressed={on}
            className={cx(styles.star, on && styles.on)}
            onClick={() => onChange(n)}
          >
            <StarIcon size={40} filled={on} />
          </button>
        )
      })}
    </div>
  )
}
