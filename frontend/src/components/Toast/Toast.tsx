import { cx } from '../../lib/cx'
import styles from './Toast.module.css'

type ToastProps = {
  /** Current message; null renders the (empty) live region only. */
  message: string | null
  className?: string
}

/** Bottom pill above the tab bar. The live region is always mounted so screen readers announce changes. */
export function Toast({ message, className }: ToastProps) {
  return (
    <div role="status" aria-live="polite" className={cx(styles.region, className)}>
      {message && <div className={styles.toast}>{message}</div>}
    </div>
  )
}
