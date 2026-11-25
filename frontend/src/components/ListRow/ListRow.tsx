import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { ChevronRightIcon } from '../icons/icons'
import styles from './ListRow.module.css'

type ListRowProps = {
  label: ReactNode
  /** Muted value before the chevron ("Español"). */
  value?: ReactNode
  to?: string
  onClick?: () => void
  last?: boolean
  className?: string
}

/** 56 px settings row with chevron, as a link or a button. */
export function ListRow({ label, value, to, onClick, last = false, className }: ListRowProps) {
  const classes = cx(styles.row, last && styles.last, className)
  const content = (
    <>
      <span>{label}</span>
      <span className={styles.end}>
        {value !== undefined && <span className={styles.value}>{value}</span>}
        <ChevronRightIcon className={styles.chevron} />
      </span>
    </>
  )
  if (to !== undefined) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  )
}
