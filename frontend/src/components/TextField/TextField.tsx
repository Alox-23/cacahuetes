import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './TextField.module.css'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  /** Muted help line under the field (hidden while an error is shown). Added in feature 4. */
  hint?: string
  /** Control inside the field, on the right (e.g. "Mostrar" for passwords). Added in feature 4. */
  trailing?: ReactNode
}

/** Text input with a visible label and optional error (used by spec 2 forms). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, className, id, type = 'text', ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const note = error ? errorId : hint ? hintId : undefined
  const input = (
    <input
      ref={ref}
      id={inputId}
      type={type}
      className={cx(styles.input, error && styles.invalid, trailing !== undefined && styles.withTrailing)}
      aria-invalid={error ? true : undefined}
      aria-describedby={note}
      {...rest}
    />
  )
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {trailing !== undefined ? (
        <div className={styles.control}>
          {input}
          <div className={styles.trailing}>{trailing}</div>
        </div>
      ) : (
        input
      )}
      {error ? (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      ) : (
        hint && (
          <span id={hintId} className={styles.hint} aria-live="polite">
            {hint}
          </span>
        )
      )}
    </div>
  )
})
