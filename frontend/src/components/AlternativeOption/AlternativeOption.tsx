import { cx } from '../../lib/cx'
import { CheckIcon } from '../icons/icons'
import styles from './AlternativeOption.module.css'

type AlternativeOptionProps = {
  name: string
  detail: string
  selected: boolean
  onSelect: () => void
  className?: string
}

/** 72 px selectable card (aria-pressed) with a check icon when selected. */
export function AlternativeOption({ name, detail, selected, onSelect, className }: AlternativeOptionProps) {
  return (
    <button type="button" aria-pressed={selected} className={cx(styles.option, selected && styles.selected, className)} onClick={onSelect}>
      <span className={styles.text}>
        <span>{name}</span>
        <span className={styles.detail}>{detail}</span>
      </span>
      {selected && <CheckIcon className={styles.check} />}
    </button>
  )
}
