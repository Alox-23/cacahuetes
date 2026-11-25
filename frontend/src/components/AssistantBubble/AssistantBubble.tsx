import type { ReactNode } from 'react'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { Mascot } from '../Mascot/Mascot'
import styles from './AssistantBubble.module.css'

type AssistantBubbleProps = {
  children?: ReactNode
  /** Label row text; always shown (defaults to "Cacahuete · IA"). */
  label?: string
  className?: string
}

/** Assistant message: always starts with the "Cacahuete · IA" label row. */
export function AssistantBubble({ children, label, className }: AssistantBubbleProps) {
  return (
    <div className={cx(styles.bubble, className)}>
      <span className={styles.label}>
        <Mascot size={20} />
        {label ?? t('assistant.label')}
      </span>
      {children}
    </div>
  )
}
