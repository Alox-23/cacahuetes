import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssistantHeader, ChatInput, Screen } from '../components'
import { describeSelection } from '../assistant/format'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { t } from '../i18n'
import { useChat, usePreferences } from '../state/AppState'
import { MessageList } from './chat/MessageList'
import { OnboardingForm } from './chat/OnboardingForm'
import { ReplyView } from './chat/ReplyView'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { savePreferences } = usePreferences()
  const { messages, pending, send, ensure } = useChat('onboarding')

  useEffect(() => {
    ensure({ key: 'onboarding', greet: true })
  }, [ensure])

  const last = messages[messages.length - 1]
  const complete = last?.kind === 'assistant' && last.reply.display?.complete === true
  useEffect(() => {
    if (complete) navigate('/chat', { replace: true })
  }, [complete, navigate])

  async function skip() {
    await savePreferences(DEFAULT_PREFERENCES)
    navigate('/chat', { replace: true })
  }

  return (
    <Screen fixed>
      <AssistantHeader onSkip={skip} />
      <MessageList
        messages={messages}
        pending={pending}
        renderReply={(reply, isLast, chosen) => (
          <ReplyView
            reply={reply}
            interactive={isLast}
            chosen={chosen}
            renderOptions={(r, interactive, picked) => (
              <OnboardingForm
                reply={r}
                readOnly={!interactive}
                chosen={picked}
                onQuick={(o) => void send({ option: o.value }, o.label)}
                onSubmit={(values) => void send({ option: values.join(',') }, describeSelection(values))}
              />
            )}
          />
        )}
      />
      <ChatInput placeholder={t('onboarding.placeholder')} disabled={pending} onSend={(text) => void send({ text })} />
    </Screen>
  )
}
