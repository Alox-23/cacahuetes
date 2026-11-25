import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './IconButton.module.css'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name (the button only shows an icon). */
  label: string
  children: ReactNode
}

/** 56 px square secondary button with an icon (share). */
export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={cx(styles.button, className)} {...rest}>
      {children}
    </button>
  )
}
