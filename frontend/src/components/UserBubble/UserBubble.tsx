import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './UserBubble.module.css'

export function UserBubble({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.bubble, className)}>{children}</div>
}
