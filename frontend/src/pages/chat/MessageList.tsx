import { Fragment, type ReactNode } from 'react'
import { ChatLog, TypingIndicator, UserBubble } from '../../components'
import type { RichReply } from '../../assistant/types'
import type { ThreadItem } from '../../state/thread'

type MessageListProps = {
  messages: ThreadItem[]
  pending: boolean
  /** Render one assistant reply; `isLast` marks the one whose controls are live. */
  renderReply: (reply: RichReply, isLast: boolean, chosen?: string, item?: ThreadItem) => ReactNode
  /** Other item kinds (progress, notices); not used by the mobile mode views. */
  renderOther?: (item: ThreadItem) => ReactNode
  /** Content above the messages (e.g. the route chip in change mode). */
  before?: ReactNode
  /** Content under the last message (e.g. a muted note). */
  after?: ReactNode
  /** Which item is live (default: the newest assistant item; null: none). */
  liveId?: string | null
  logClassName?: string
  className?: string
}

/** Transcript: user and assistant bubbles, typing indicator, scrolling (spec 4). */
export function MessageList({ messages, pending, renderReply, renderOther, before, after, liveId, logClassName, className }: MessageListProps) {
  const live = liveId !== undefined ? liveId : [...messages].reverse().find((m) => m.kind === 'assistant')?.id
  const last = messages[messages.length - 1]
  return (
    <ChatLog
      scrollKey={`${messages.length}-${pending}-${last?.kind === 'progress' ? last.status : ''}`}
      forceScroll={last?.kind === 'user'}
      className={className}
      logClassName={logClassName}
    >
      {before}
      {messages.map((m) => {
        if (m.kind === 'user') return <UserBubble key={m.id}>{m.text}</UserBubble>
        if (m.kind === 'assistant') return <Fragment key={m.id}>{renderReply(m.reply, !pending && m.id === live, m.chosen, m)}</Fragment>
        return <Fragment key={m.id}>{renderOther?.(m)}</Fragment>
      })}
      {pending && <TypingIndicator />}
      {!pending && after}
    </ChatLog>
  )
}
