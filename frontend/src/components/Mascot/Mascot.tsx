import { cx } from '../../lib/cx'
import styles from './Mascot.module.css'

type MascotProps = {
  size?: number
  /** When given the mascot is announced (role="img"); otherwise it is decorative. */
  label?: string
  className?: string
}

/** Cacahuete, inline from docs/design/mascot/cacahuete.svg (colors via tokens). */
export function Mascot({ size = 38, label, className }: MascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx(styles.mascot, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path
        className={styles.shell}
        d="M12 2.5c-2.8 0-5 2.1-5 4.8 0 1.5.6 2.5 1.1 3.4.4.7.4 1.4 0 2.1-.6 1-1.6 2.2-1.6 4.2 0 3 2.5 5 5.5 5s5.5-2 5.5-5c0-2-1-3.2-1.6-4.2-.4-.7-.4-1.4 0-2.1.5-.9 1.1-1.9 1.1-3.4 0-2.7-2.2-4.8-5-4.8z"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle className={styles.eye} cx="10.2" cy="8" r="0.9" />
      <circle className={styles.eye} cx="13.8" cy="8" r="0.9" />
      <path className={styles.mouth} d="M10.2 10.3c.8.9 2.8.9 3.6 0" strokeWidth="1.1" strokeLinecap="round" />
      <path className={styles.lines} d="M9.5 17l1.5 1.5M13 16.5l1.5 1.5" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
