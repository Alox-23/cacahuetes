import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  fullWidth?: boolean
  /** Render as a router link to this path instead of a <button>. */
  to?: string
  replace?: boolean
  /** Router state for `to` links (e.g. the desktop dialog background). */
  state?: unknown
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fullWidth = false, to, replace, state, className, children, type = 'button', ...rest },
  ref,
) {
  const classes = cx(styles.button, styles[variant], fullWidth && styles.fullWidth, className)
  if (to !== undefined) {
    return (
      <Link to={to} replace={replace} state={state} className={classes} onClick={rest.onClick as never}>
        {children}
      </Link>
    )
  }
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {children}
    </button>
  )
})
