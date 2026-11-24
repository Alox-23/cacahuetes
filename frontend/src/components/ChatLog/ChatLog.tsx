import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import styles from './ChatLog.module.css'

type ChatLogProps = {
  children: ReactNode
  /** Changes when content is added. */
  scrollKey?: unknown
  /** Scroll to the bottom on this change even if the reader scrolled up (the user just sent). */
  forceScroll?: boolean
  className?: string
  /** Extra class for the scrolling element (e.g. a centred column on desktop). */
  logClassName?: string
}

/** Distance from the bottom (px) under which the reader counts as "at the bottom". */
const NEAR_BOTTOM = 80

/**
 * Scrollable transcript anchored to the bottom (role="log", polite live region).
 * New content scrolls into view only when the reader is already near the bottom;
 * otherwise a "Mensaje nuevo" button appears and jumps down (spec 4).
 */
export function ChatLog({ children, scrollKey, forceScroll = false, className, logClassName }: ChatLogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useRef(true)
  const [unseen, setUnseen] = useState(false)

  const toBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    near.current = true
    setUnseen(false)
  }, [])

  useLayoutEffect(() => {
    if (near.current || forceScroll) toBottom()
    else setUnseen(true)
  }, [scrollKey, forceScroll, toBottom])

  // Keep the reading position when the column width changes (desktop panel in / out).
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (near.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function onScroll() {
    const el = ref.current
    if (!el) return
    near.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (near.current) setUnseen(false)
  }

  return (
    <div className={cx(styles.wrap, className)}>
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        aria-label={t('assistant.transcriptLabel')}
        className={cx(styles.log, logClassName)}
        onScroll={onScroll}
      >
        {children}
      </div>
      {unseen && (
        <button type="button" className={styles.newMessage} onClick={toBottom}>
          {t('chat.newMessage')}
        </button>
      )}
    </div>
  )
}
