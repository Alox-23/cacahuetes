import { Navigate, useNavigate } from 'react-router-dom'
import { AssistantHeader, ChatInput, Screen, SummaryCard } from '../components'
import { t } from '../i18n'
import { useChat, usePendingRequest, usePreferences } from '../state/AppState'
import { MessageList } from './chat/MessageList'
import { ReplyView } from './chat/ReplyView'
import styles from './chat/chat.module.css'

export function ConversationPage() {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const { setPendingRequest } = usePendingRequest()
  const { messages, pending, send } = useChat('request')

  if (messages.length === 0) return <Navigate to="/chat" replace />

  const last = messages[messages.length - 1]
  const hasSummary = messages.some((m) => m.role === 'assistant' && m.reply.kind === 'summary')
  const showNote = last.role === 'assistant' && last.reply.kind === 'question'

  return (
    <Screen fixed>
      <AssistantHeader backTo="/chat" />
      <MessageList
        messages={messages}
        pending={pending}
        after={showNote ? <p className={styles.note}>{t('conversation.note')}</p> : null}
        renderReply={(reply, isLast) => (
          <ReplyView
            reply={reply}
            interactive={isLast}
            onOption={(o) => void send({ option: o.value }, o.label)}
            renderSummary={(r, interactive) =>
              r.request && (
                <SummaryCard
                  request={r.request}
                  preferences={preferences}
                  onCreate={
                    interactive
                      ? () => {
                          setPendingRequest(r.request ?? null)
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
