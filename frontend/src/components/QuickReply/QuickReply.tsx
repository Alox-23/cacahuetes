import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import styles from './QuickReply.module.css'

type QuickReplyProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  /** Shown as chosen (answered questions in the history); exposed with aria-pressed. */
  selected?: boolean
}

/** Pill button that answers the assistant in one tap. */
export function QuickReply({ label, selected, className, ...rest }: QuickReplyProps) {
  return (
    <button
      type="button"
      aria-pressed={selected === undefined ? undefined : selected}
      className={cx(styles.reply, selected && styles.selected, className)}
      {...rest}
    >
      {label}
    </button>
  )
}
