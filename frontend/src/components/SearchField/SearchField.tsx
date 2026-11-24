import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import { SearchIcon } from '../icons/icons'
import styles from './SearchField.module.css'

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Visually hidden label. */
  label: string
}

/** 48 px search input, radius 16, leading magnifier icon. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ label, id, className, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <SearchIcon className={styles.icon} />
      <input ref={ref} id={inputId} type="search" className={styles.input} {...rest} />
    </div>
  )
})
