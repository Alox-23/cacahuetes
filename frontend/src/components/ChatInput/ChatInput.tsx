import { forwardRef, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
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

/** Four lines of 22 px plus the vertical padding (spec 4: grows to four lines, then scrolls). */
const MAX_HEIGHT = 4 * 22 + 26

/**
 * Bottom message bar: a textarea that grows to four lines + round send button.
 * Enter sends, Shift+Enter inserts a line break (never while an IME composes).
 */
export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(function ChatInput(
  { placeholder, onSend, disabled = false, label, className },
  forwardedRef,
) {
  const id = useId()
  const [value, setValue] = useState('')
  const inner = useRef<HTMLTextAreaElement | null>(null)
  const canSend = !disabled && value.trim().length > 0

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    // Scroll inside only past four lines (no scrollbar gutter on a short message).
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  function send() {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    send()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    // keyCode 229: some browsers report IME composition this way.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    send()
  }

  return (
    <form className={cx(styles.bar, className)} onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        {label ?? t('common.messageLabel')}
      </label>
      <textarea
        id={id}
        ref={(el) => {
          inner.current = el
          if (typeof forwardedRef === 'function') forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        rows={1}
        maxLength={500}
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button type="submit" className={styles.send} aria-label={t('common.send')} disabled={!canSend}>
        <SendIcon />
      </button>
    </form>
  )
})
