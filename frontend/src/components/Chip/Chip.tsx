import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './Chip.module.css'

type ChipProps = HTMLAttributes<HTMLSpanElement> & { children: ReactNode }

/** Static tag (preferences, summary). */
export function Chip({ className, children, ...rest }: ChipProps) {
  return (
    <span className={cx(styles.chip, className)} {...rest}>
      {children}
    </span>
  )
}
