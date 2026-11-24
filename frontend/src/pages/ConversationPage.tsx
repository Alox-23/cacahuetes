import { Navigate, useNavigate } from 'react-router-dom'
import { AssistantHeader, ChatInput, Screen, SummaryCard } from '../components'
import { t } from '../i18n'
import { useChat, useCreation, usePreferences } from '../state/AppState'
import { MessageList } from './chat/MessageList'
import { ReplyView } from './chat/ReplyView'
import styles from './chat/chat.module.css'

export function ConversationPage() {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const { startCreation } = useCreation()
  const { messages, pending, send } = useChat('request')

  // Empty and not waiting for a first reply (Reutilizar greets with the summary).
  if (messages.length === 0 && !pending) return <Navigate to="/chat" replace />

  const last = messages[messages.length - 1] as (typeof messages)[number] | undefined
  const hasSummary = messages.some((m) => m.kind === 'assistant' && m.reply.kind === 'summary')
  const showNote = last?.kind === 'assistant' && last.reply.kind === 'question'

  return (
    <Screen fixed>
      <AssistantHeader backTo="/chat" />
      <MessageList
        messages={messages}
        pending={pending}
        after={showNote ? <p className={styles.note}>{t('conversation.note')}</p> : null}
        renderReply={(reply, isLast, chosen) => (
          <ReplyView
            reply={reply}
            interactive={isLast}
            chosen={chosen}
            onOption={(o) => void send({ option: o.value }, o.label)}
            renderSummary={(r, interactive) =>
              r.request && (
                <SummaryCard
                  request={r.request}
                  preferences={preferences}
                  onCreate={
                    interactive
                      ? () => {
                          if (r.request) startCreation(r.request)
                          navigate('/creating')
                        }
                      : undefined
                  }
                />
              )
            }
          />
        )}
      />
      <ChatInput
        placeholder={hasSummary ? t('conversation.placeholderSummary') : t('conversation.placeholder')}
        disabled={pending}
        onSend={(text) => void send({ text })}
      />
    </Screen>
  )
}
