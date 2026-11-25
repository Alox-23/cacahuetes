import type { ReactNode } from 'react'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import styles from './UserBubble.module.css'

/** User message. A visually hidden "Tú:" names the author without relying on colour. */
export function UserBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.bubble, className)}>
      <span className="sr-only">{t('chat.you')} </span>
      {children}
    </div>
  )
}
