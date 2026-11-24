import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import styles from './ChatLog.module.css'

type ChatLogProps = {
  children: ReactNode
  /** Changes when content is added, to scroll to the bottom. */
  scrollKey?: unknown
  className?: string
}

/** Scrollable transcript anchored to the bottom (role="log", polite live region). */
export function ChatLog({ children, scrollKey, className }: ChatLogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [scrollKey])

  return (
    <div ref={ref} role="log" aria-live="polite" aria-label={t('assistant.transcriptLabel')} className={cx(styles.log, className)}>
      {children}
    </div>
  )
}
