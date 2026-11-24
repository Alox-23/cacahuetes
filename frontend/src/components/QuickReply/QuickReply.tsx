import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import styles from './QuickReply.module.css'

type QuickReplyProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
}

/** Pill button that answers the assistant in one tap. */
export function QuickReply({ label, className, ...rest }: QuickReplyProps) {
  return (
    <button type="button" className={cx(styles.reply, className)} {...rest}>
      {label}
    </button>
  )
}
