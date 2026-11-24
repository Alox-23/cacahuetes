import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './Card.module.css'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  /** CSS padding shorthand, e.g. "16px 20px 20px". */
  padding?: string
}

export function Card({ children, padding, className, style, ...rest }: CardProps) {
  return (
    <div className={cx(styles.card, className)} style={padding ? { padding, ...style } : style} {...rest}>
      {children}
    </div>
  )
}
