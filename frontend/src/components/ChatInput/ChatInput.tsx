import { useId, useState, type FormEvent } from 'react'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { SendIcon } from '../icons/icons'
import styles from './ChatInput.module.css'

type ChatInputProps = {
  placeholder: string
  onSend: (text: string) => void
  /** Blocks sending (e.g. while the assistant is replying); typing stays possible. */
  disabled?: boolean
  label?: string
  className?: string
}

/** Bottom message bar: rounded input + round send button. */
export function ChatInput({ placeholder, onSend, disabled = false, label, className }: ChatInputProps) {
  const id = useId()
  const [value, setValue] = useState('')
  const canSend = !disabled && value.trim().length > 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <form className={cx(styles.bar, className)} onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        {label ?? t('common.messageLabel')}
      </label>
      <input
        id={id}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button type="submit" className={styles.send} aria-label={t('common.send')} disabled={!canSend}>
        <SendIcon />
      </button>
    </form>
  )
}
