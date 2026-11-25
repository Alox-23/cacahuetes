import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { BackIcon } from '../icons/icons'
import styles from './FloatingBackButton.module.css'

type FloatingBackButtonProps = { onClick: () => void; label?: string; className?: string }

/** 44 px white round back button floating over the map or the place photo. */
export function FloatingBackButton({ onClick, label, className }: FloatingBackButtonProps) {
  return (
    <button type="button" aria-label={label ?? t('common.back')} className={cx(styles.button, className)} onClick={onClick}>
      <BackIcon />
    </button>
  )
}
