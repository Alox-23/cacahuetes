import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './OptionChip.module.css'

type OptionChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onToggle'> & {
  selected: boolean
  onToggle: (selected: boolean) => void
  children: ReactNode
}

/** Toggleable option (multi-select). Announced with aria-pressed. */
export const OptionChip = forwardRef<HTMLButtonElement, OptionChipProps>(function OptionChip(
  { selected, onToggle, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cx(styles.chip, selected && styles.selected, className)}
      onClick={() => onToggle(!selected)}
      {...rest}
    >
      {children}
    </button>
  )
})
