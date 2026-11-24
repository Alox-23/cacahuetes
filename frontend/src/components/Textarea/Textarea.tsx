import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import styles from './Textarea.module.css'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  /** Muted text after the label, e.g. "(opcional)". */
  labelHint?: ReactNode
}

/** Multi-line field with a visible label (72 px high, no resize). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, labelHint, id, className, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label} {labelHint && <span className={styles.hint}>{labelHint}</span>}
      </label>
      <textarea ref={ref} id={inputId} className={styles.input} {...rest} />
    </div>
  )
})
