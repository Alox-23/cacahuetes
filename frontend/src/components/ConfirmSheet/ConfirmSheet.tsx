import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { t } from '../../i18n'
import { useLayout } from '../../lib/useLayout'
import { Dialog } from '../Dialog/Dialog'
import styles from './ConfirmSheet.module.css'

type ConfirmSheetProps = {
  open: boolean
  title: string
  text: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Disables the buttons while the action runs. */
  busy?: boolean
}

/**
 * Bottom sheet confirming a destructive action (delete route, delete account,
 * sign out). Closes on backdrop tap and Escape; focus moves into the sheet,
 * stays inside while open and returns to the trigger on close.
 */
export function ConfirmSheet(props: ConfirmSheetProps) {
  const desktop = useLayout() === 'desktop'
  // Desktop: the same confirmation as a centred dialog (feature 3 §8).
  if (desktop) return props.open ? <ConfirmDialog {...props} /> : null
  return <BottomSheet {...props} />
}

function ConfirmDialog({ title, text, confirmLabel, onConfirm, onCancel, busy = false }: ConfirmSheetProps) {
  return (
    <Dialog title={title} description={text} onClose={busy ? () => undefined : onCancel} size="small">
      <div className={styles.actions}>
        <button type="button" className={styles.danger} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy} data-autofocus>
          {t('confirm.cancel')}
        </button>
      </div>
    </Dialog>
  )
}

function BottomSheet({ open, title, text, confirmLabel, onConfirm, onCancel, busy = false }: ConfirmSheetProps) {
  const titleId = useId()
  const textId = useId()
  const sheet = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => previous?.focus?.()
  }, [open])

  if (!open) return null

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !sheet.current) return
    const buttons = Array.from(sheet.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={styles.overlay} onKeyDown={onKeyDown}>
      <div className={styles.backdrop} aria-hidden="true" onClick={busy ? undefined : onCancel} />
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} className={styles.sheet}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p id={textId} className={styles.text}>
          {text}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.danger} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
          <button ref={cancel} type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            {t('confirm.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
