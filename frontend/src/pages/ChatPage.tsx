import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, ChatInput, Chip, Mascot, Screen } from '../components'
import { preferenceChips } from '../assistant/format'
import { t } from '../i18n'
import { useAppState, useChat, usePreferences } from '../state/AppState'
import styles from './ChatPage.module.css'

const SUGGESTIONS = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3'] as const
/** Feature 5 (API mode): the same texts as examples that prefill the input instead of sending. */
const EXAMPLES = ['chat.example1', 'chat.example2', 'chat.example3'] as const

export function ChatPage() {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const { start, send } = useChat('request')
  const { conversational } = useAppState()
  const [prefill, setPrefill] = useState<{ text: string; id: number }>()

  function startRequest(text: string) {
    start({ key: `request-${Date.now()}` })
    void send({ text })
    navigate('/chat/conversation')
  }

  return (
    <Screen fixed tabBar="assistant">
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('chat.title')}</h1>
          <span className={styles.badge}>
            <Mascot size={20} />
            {t('assistant.badge')}
          </span>
        </div>

        <Card padding="4px 16px 16px" className={styles.prefs}>
          <div className={styles.prefsHeader}>
            <span className={styles.prefsTitle}>{t('chat.savedPreferences')}</span>
            <Link to="/preferences" className={styles.change}>
              {t('common.change')}
            </Link>
          </div>
          <div className={styles.chips}>
            {preferences && preferenceChips(preferences).map((c, i) => <Chip key={`${c}-${i}`}>{c}</Chip>)}
          </div>
        </Card>

        <div className={styles.bottom}>
          <Mascot size={72} />
          <div className={styles.intro}>
            <h2 className={styles.heading}>{t('chat.heading')}</h2>
            <p className={styles.helper}>{conversational ? t('chat.helperAgent') : t('chat.helper')}</p>
          </div>
          {conversational ? (
            <ul className={styles.suggestions} aria-label={t('chat.examplesLabel')}>
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => setPrefill((p) => ({ text: t(key), id: (p?.id ?? 0) + 1 }))}
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={styles.suggestions} aria-label={t('chat.suggestionsLabel')}>
              {SUGGESTIONS.map((key) => (
                <li key={key}>
                  <button type="button" className={styles.suggestion} onClick={() => startRequest(t(key))}>
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ChatInput placeholder={t('chat.placeholder')} onSend={startRequest} prefill={prefill} />
    </Screen>
  )
}
