import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import styles from './Sheet.module.css'

type SheetProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode }

/** White sheet with rounded top that overlaps the map/photo above by 20 px (Ruta, Lugar). */
export function Sheet({ children, className, ...rest }: SheetProps) {
  return (
    <div className={cx(styles.sheet, className)} {...rest}>
      {children}
    </div>
  )
}
