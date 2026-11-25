import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import styles from './StopRow.module.css'

type StopRowProps = {
  order: number
  name: ReactNode
  detail: ReactNode
  time: string
  /** "lg": 66 px (Ruta); "md": 58 px (cards). */
  size?: 'lg' | 'md'
  /** Makes the name a link (Ruta → Lugar). */
  to?: string
  /** Router state for the link (e.g. history depth). */
  linkState?: unknown
  /** No bottom divider (last row). */
  last?: boolean
  className?: string
}

/** Order badge + name + detail + time. */
export function StopRow({ order, name, detail, time, size = 'lg', to, linkState, last = false, className }: StopRowProps) {
  return (
    <div className={cx(styles.row, styles[size], last && styles.last, className)}>
      <span className={styles.badge} aria-hidden="true">
        {order}
      </span>
      <div className={styles.text}>
        {to ? (
          <Link to={to} state={linkState} className={cx(styles.name, styles.link)}>
            {name}
          </Link>
        ) : (
          <span className={styles.name}>{name}</span>
        )}
        <span className={styles.detail}>{detail}</span>
      </div>
      <span className={styles.time}>{time}</span>
    </div>
  )
}
