import { Fragment, type ReactNode } from 'react'
import { ChatLog, TypingIndicator, UserBubble } from '../../components'
import type { RichReply } from '../../assistant/types'
import type { ChatMessage } from '../../state/AppState'

type MessageListProps = {
  messages: ChatMessage[]
  pending: boolean
  /** Render one assistant reply; `isLast` marks the one whose controls are live. */
  renderReply: (reply: RichReply, isLast: boolean) => ReactNode
  /** Content above the messages (e.g. the route chip in change mode). */
  before?: ReactNode
  /** Content under the last message (e.g. a muted note). */
  after?: ReactNode
}

/** Transcript: user and assistant bubbles, typing indicator, auto-scroll. */
export function MessageList({ messages, pending, renderReply, before, after }: MessageListProps) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  return (
    <ChatLog scrollKey={`${messages.length}-${pending}`}>
      {before}
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserBubble key={m.id}>{m.text}</UserBubble>
        ) : (
          <Fragment key={m.id}>{renderReply(m.reply, !pending && m === lastAssistant)}</Fragment>
        ),
      )}
      {pending && <TypingIndicator />}
      {!pending && after}
    </ChatLog>
  )
}
