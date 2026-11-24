import { t } from '../../i18n'
import { AssistantBubble } from '../AssistantBubble/AssistantBubble'
import styles from './TypingIndicator.module.css'

/** "Thinking" state shown while the assistant prepares a reply. */
export function TypingIndicator() {
  return (
    <AssistantBubble>
      <span className={styles.dots} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
      <span className="sr-only" aria-live="polite" data-testid="typing">
        {t('assistant.typing')}
      </span>
    </AssistantBubble>
  )
}
