import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { CloseIcon } from '../icons/icons'
import { useModal } from '../Modal/useModal'
import styles from './Dialog.module.css'

type DialogProps = {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Smaller title / width for confirmations. */
  size?: 'normal' | 'small'
  /** Muted text under the title. */
  description?: ReactNode
  className?: string
}

/**
 * Centred modal dialog (desktop): labelled by its title, backdrop dims the
 * view, focus is trapped, Esc and backdrop click close, focus returns to the
 * opener, body scroll is locked. Width --desktop-dialog-width.
 */
export function Dialog({ title, onClose, children, size = 'normal', description, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  useModal(ref, onClose)
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="dialog-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(styles.dialog, styles[size], className)}
      >
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {description && (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
