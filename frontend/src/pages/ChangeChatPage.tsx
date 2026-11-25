import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AssistantHeader, ChatInput, Header, Screen } from '../components'
import type { Route } from '../contract/types'
import { t } from '../i18n'
import { useChat, useCurrentRoute, useData } from '../state/AppState'
import { MessageList } from './chat/MessageList'
import { ReplyView } from './chat/ReplyView'
import { useCreatedHandover } from './chat/useCreatedHandover'
import styles from './chat/chat.module.css'

export function ChangeChatPage() {
  const { id = '' } = useParams()
  const data = useData()
  const { setCurrentRouteId } = useCurrentRoute()
  const { messages, pending, send, ensure } = useChat('change')
  const [route, setRoute] = useState<Route | null>(null)
  const [missing, setMissing] = useState(false)
  // Feature 5: "hazme otra ruta" here also plays the Creando screen before opening the new route.
  useCreatedHandover(messages)

  // Re-read the route after every reply so the header chip stays current.
  useEffect(() => {
    let alive = true
    data.getRoute(id).then(
      (r) => alive && setRoute(r),
      () => alive && setMissing(true),
    )
    return () => {
      alive = false
    }
  }, [data, id, messages.length])

  useEffect(() => {
    if (!route) return
    setCurrentRouteId(route.id)
    ensure({ key: route.id, route, greet: true, greetIfEmpty: true })
  }, [route, ensure, setCurrentRouteId])

  if (missing) {
    return (
      <Screen className={styles.missing}>
        <Header backTo="/chat" />
        <p className={styles.note}>{t('route.notFound')}</p>
      </Screen>
    )
  }

  const stops = route?.stops.length ?? 0
  const chip = route ? (
    <div className={styles.routeChip}>
      <span className={styles.routeChipName}>{route.name}</span>
      <span>{stops === 1 ? t('change.stopsOne') : t('change.stops', { count: stops })}</span>
    </div>
  ) : null

  return (
    <Screen fixed>
      <AssistantHeader backTo={`/route/${id}`} />
      <MessageList
        messages={messages}
        pending={pending}
        before={chip}
        renderReply={(reply, isLast, chosen) => (
          <ReplyView
            reply={reply}
            interactive={isLast}
            chosen={chosen}
            routeHref={`/route/${id}`}
            onOption={(o) => void send({ option: o.value }, o.label)}
            onUndo={() => void send({ option: 'undo' }, t('common.undo'))}
          />
        )}
      />
      <ChatInput placeholder={t('change.placeholder')} disabled={pending} onSend={(text) => void send({ text })} />
    </Screen>
  )
}
