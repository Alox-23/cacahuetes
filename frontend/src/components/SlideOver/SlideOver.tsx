import { useRef, type ReactNode } from 'react'
import { t } from '../../i18n'
import { CloseIcon } from '../icons/icons'
import { useModal } from '../Modal/useModal'
import styles from './SlideOver.module.css'

type SlideOverProps = { label: string; onClose: () => void; children: ReactNode }

/**
 * Panel that slides over the stop list from the right, inside the route panel
 * (the map stays visible). Esc closes; focus moves in and returns.
 */
export function SlideOver({ label, onClose, children }: SlideOverProps) {
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, onClose, { trap: false, lockScroll: false })
  return (
    <aside ref={ref} aria-label={label} tabIndex={-1} className={styles.panel}>
      <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>
        <CloseIcon />
      </button>
      {children}
    </aside>
  )
}
