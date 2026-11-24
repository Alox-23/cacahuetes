import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { BackIcon } from '../icons/icons'
import styles from './Header.module.css'

type HeaderProps = {
  title?: ReactNode
  /** Back control as a link to this path… */
  backTo?: string
  /** …or as a button. */
  onBack?: () => void
  backLabel?: string
  right?: ReactNode
  className?: string
}

/** 44 px top row with optional back control (44×44, -12 px left margin). */
export function Header({ title, backTo, onBack, backLabel, right, className }: HeaderProps) {
  const label = backLabel ?? t('common.back')
  return (
    <header className={cx(styles.header, className)}>
      {backTo !== undefined ? (
        <Link to={backTo} aria-label={label} className={styles.back}>
          <BackIcon />
        </Link>
      ) : onBack ? (
        <button type="button" aria-label={label} className={styles.back} onClick={onBack}>
          <BackIcon />
        </button>
      ) : null}
      {title !== undefined && <h1 className={styles.title}>{title}</h1>}
      {right && <div className={styles.right}>{right}</div>}
    </header>
  )
}
