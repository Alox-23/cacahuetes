import { Navigate, useNavigate } from 'react-router-dom'
import { AssistantHeader, ChatInput, Screen, SummaryCard } from '../components'
import { t } from '../i18n'
import { useAppState, useChat, useCreation, usePreferences } from '../state/AppState'
import { MessageList } from './chat/MessageList'
import { ReplyView } from './chat/ReplyView'
import { useCreatedHandover } from './chat/useCreatedHandover'
import styles from './chat/chat.module.css'

export function ConversationPage() {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const { startCreation } = useCreation()
  const { messages, pending, send } = useChat('request')
  const { conversational } = useAppState()
  // Feature 5: a reply that created a route opens the Creando screen (no SummaryCard in API mode).
  useCreatedHandover(messages)

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
        after={showNote ? <p className={styles.note}>{conversational ? t('conversation.noteAgent') : t('conversation.note')}</p> : null}
        renderReply={(reply, isLast, chosen) => (
          <ReplyView
            reply={reply}
            interactive={isLast}
            chosen={chosen}
            // Feature 5: an agent reply that created or changed a route links to it.
            routeHref={reply.display?.routeId ? `/route/${reply.display.routeId}` : undefined}
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
        placeholder={
          conversational
            ? t('conversation.placeholderAgent')
            : hasSummary
              ? t('conversation.placeholderSummary')
              : t('conversation.placeholder')
        }
        disabled={pending}
        onSend={(text) => void send({ text })}
      />
    </Screen>
  )
}
