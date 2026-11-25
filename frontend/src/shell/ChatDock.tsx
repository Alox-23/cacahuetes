import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AssistantBubble, ChaseAnimation, ChatInput, Chip, ChevronDownIcon, ChevronRightIcon, Mascot, QuickReply, SummaryCard } from '../components'
import { describeSelection, formatDateLong, preferenceChips } from '../assistant/format'
import type { AssistantMode, RichReply } from '../assistant/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { tabForPath } from '../lib/tabs'
import { CreationSteps } from '../pages/chat/CreationSteps'
import { MessageList } from '../pages/chat/MessageList'
import { OnboardingForm } from '../pages/chat/OnboardingForm'
import { ReplyView } from '../pages/chat/ReplyView'
import chatStyles from '../pages/chat/chat.module.css'
import type { Route } from '../contract/types'
import { useAppState } from '../state/AppState'
import { liveAssistant, modeView, type ThreadItem } from '../state/thread'
import { panelRouteId, type PanelKind } from './desktopPaths'
import styles from './ChatDock.module.css'

/** The route shown in the panel (null without one), refetched on every route change. */
function usePanelRoute(id: string | null): Route | null {
  const { data, routeRevision } = useAppState()
  const [route, setRoute] = useState<Route | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    data.getRoute(id).then(
      (r) => alive && setRoute(r),
      () => alive && setRoute(null),
    )
    return () => {
      alive = false
    }
  }, [data, id, routeRevision])
  return id && route?.id === id ? route : null
}

const SUGGESTIONS = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3'] as const

type ChatDockProps = { contextPath: string; panel: PanelKind | null }

/**
 * The one chat on desktop (feature 3 §4.5), built from the mobile chat parts.
 * The mode that receives input comes from state: no preferences → onboarding;
 * a route in the panel → change for it; otherwise → request.
 */
export function ChatDock({ contextPath, panel }: ChatDockProps) {
  const navigate = useNavigate()
  const app = useAppState()
  const { preferences, thread, epochs, pending, send, startChat, ensureChat, chatKey, addNotice, creation, startCreation, usedRequestEpoch } = app
  const routeId = panelRouteId(panel)
  const route = usePanelRoute(routeId)
  const mode: AssistantMode = !preferences ? 'onboarding' : routeId ? 'change' : 'request'
  const section = tabForPath(contextPath)
  const input = useRef<HTMLTextAreaElement>(null)
  const [stripOpen, setStripOpen] = useState(false)

  const requestItems = modeView(thread, 'request', epochs.request)
  const requestUsed = usedRequestEpoch === epochs.request
  const requestEmpty = (requestItems.length === 0 || requestUsed) && !pending.request
  const creatingNow = creation?.status === 'running'

  // Onboarding greets by itself and ends on /chat.
  useEffect(() => {
    if (mode === 'onboarding') ensureChat('onboarding', { key: 'onboarding', greet: true })
  }, [mode, ensureChat])
  const lastOnboarding = liveAssistant(thread, 'onboarding', epochs.onboarding)
  const onboardingDone = lastOnboarding?.kind === 'assistant' && lastOnboarding.reply.display?.complete === true
  useEffect(() => {
    if (onboardingDone && contextPath === '/onboarding') navigate('/chat', { replace: true })
  }, [onboardingDone, contextPath, navigate])

  // A route in the panel: change mode works on it. Saved routes open with a notice (DeskMisRutas.html).
  useEffect(() => {
    if (mode !== 'change' || !route || route.id !== routeId) return
    if (chatKey('change') === route.id) return
    if (panel?.kind === 'saved') {
      startChat('change', { key: route.id, route })
      addNotice('change', [t('desktop.openedSaved', { name: route.name, date: formatDateLong(route.request.date) }), t('desktop.openedQuestion')], {
        desktopOnly: true,
        quick: [
          { label: t('desktop.quickTime'), action: 'send' },
          { label: t('desktop.quickStop'), action: 'send' },
          { label: t('desktop.quickNew'), action: 'new-request' },
        ],
      })
    } else {
      // Greets only when change mode starts for this route; after a reload it is re-armed silently
      // under the restored history, so it does not greet again.
      ensureChat('change', { key: route.id, route, greet: true })
    }
  }, [mode, route, routeId, panel?.kind, chatKey, startChat, ensureChat, addNotice])

  // Perfil: the assistant says it is still there, once per visit (DeskAjustes.html).
  const lastSection = useRef<string | null>(null)
  useEffect(() => {
    if (section === 'profile' && lastSection.current !== 'profile' && mode === 'request') {
      addNotice('request', [t('desktop.settingsHello')], { hint: t('desktop.settingsHint'), desktopOnly: true })
    }
    lastSection.current = section
  }, [section, mode, addNotice])

  // The text field takes focus when the Asistente section opens.
  useEffect(() => {
    if (section === 'assistant') input.current?.focus()
  }, [section])

  const liveId = liveAssistant(thread, mode, epochs[mode])?.id ?? null
  const lastItem = thread[thread.length - 1]

  function startRequest(text: string) {
    startChat('request', { key: `request-${Date.now()}` })
    void send('request', { text })
    if (contextPath === '/chat') navigate('/chat/conversation')
  }

  function onSend(text: string) {
    if (mode === 'request' && requestEmpty) startRequest(text)
    else void send(mode, { text })
  }

  function onQuick(item: ThreadItem, label: string, action: 'send' | 'new-request') {
    if (item.kind !== 'notice') return
    if (action === 'new-request') {
      startChat('request', { key: `request-${Date.now()}` })
      navigate('/chat')
    } else void send(item.mode, { text: label })
  }

  const placeholder =
    mode === 'onboarding'
      ? t('onboarding.placeholder')
      : mode === 'change'
        ? panel?.kind === 'saved'
          ? t('desktop.placeholderSaved')
          : t('change.placeholder')
        : creatingNow
          ? t('desktop.placeholderCreating')
          : requestEmpty
            ? t('chat.placeholder')
            : requestItems.some((i) => i.kind === 'assistant' && i.reply.kind === 'summary')
              ? t('conversation.placeholderSummary')
              : t('conversation.placeholder')

  function renderReply(reply: RichReply, isLive: boolean, chosen: string | undefined, item?: ThreadItem) {
    const itemMode = item?.mode ?? mode
    const interactive = isLive && itemMode === mode && !(itemMode === 'request' && requestUsed)
    if (itemMode === 'onboarding') {
      return (
        <ReplyView
          reply={reply}
          interactive={interactive}
          chosen={chosen}
          renderOptions={(r, live, picked) => (
            <OnboardingForm
              reply={r}
              readOnly={!live}
              chosen={picked}
              onQuick={(o) => void send('onboarding', { option: o.value }, o.label)}
              onSubmit={(values) => void send('onboarding', { option: values.join(',') }, describeSelection(values))}
            />
          )}
        />
      )
    }
    return (
      <ReplyView
        reply={reply}
        interactive={interactive}
        chosen={chosen}
        onOption={(o) => void send(itemMode, { option: o.value }, o.label)}
        onUndo={() => void send('change', { option: 'undo' }, t('common.undo'))}
        renderSummary={(r, live) =>
          r.request && (
            <SummaryCard
              request={r.request}
              preferences={preferences}
              onCreate={
                live
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
    )
  }

  function renderOther(item: ThreadItem) {
    if (item.kind === 'progress') {
      const live = creation?.id === item.id ? creation : null
      const status = live?.status ?? item.status
      return (
        <AssistantBubble>
          <span className={styles.progressTitle}>{t('desktop.creatingTitle')}</span>
          {status === 'failed' ? (
            <span role="alert">{t('desktop.creationFailed')}</span>
          ) : status === 'cancelled' ? (
            <span>{t('desktop.creationCancelled')}</span>
          ) : (
            <>
              {/* Only while it is being created: a finished progress bubble in the history stays still. */}
              {status === 'running' && <ChaseAnimation className={styles.progressChase} />}
              <CreationSteps step={status === 'done' ? 4 : (live?.step ?? 0)} compact />
              {status === 'running' && <span className={chatStyles.hint}>{t('desktop.creatingHint')}</span>}
            </>
          )}
        </AssistantBubble>
      )
    }
    if (item.kind === 'notice') {
      const live = item === lastItem && !pending[item.mode]
      return (
        <AssistantBubble>
          {item.text.map((p, i) => (
            <span key={i}>{p}</span>
          ))}
          {item.hint && <span className={chatStyles.hint}>{item.hint}</span>}
          {item.quick && (
            <div className={chatStyles.options}>
              {item.quick.map((q) => (
                <QuickReply key={q.label} label={q.label} disabled={!live} onClick={() => onQuick(item, q.label, q.action)} />
              ))}
            </div>
          )}
        </AssistantBubble>
      )
    }
    return null
  }

  const showIntro = mode === 'request' && requestEmpty && section === 'assistant' && !creatingNow
  const prefs = preferences ?? DEFAULT_PREFERENCES

  const intro = showIntro ? (
        <div className={styles.intro}>
          <Mascot size={72} />
          <div className={styles.introText}>
            <h1 className={styles.heading}>{t('chat.heading')}</h1>
            <p className={styles.helper}>{t('chat.helper')}</p>
          </div>
          <ul className={styles.suggestions} aria-label={t('chat.suggestionsLabel')}>
            {SUGGESTIONS.map((key) => (
              <li key={key}>
                <button type="button" className={styles.suggestion} onClick={() => startRequest(t(key))}>
                  {t(key)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null

  return (
    <div className={cx(styles.dock, panel ? styles.narrow : styles.wide)}>
      <header className={styles.header}>
        <Mascot size={38} />
        <div className={styles.names}>
          <span className={styles.name}>{t('assistant.name')}</span>
          <span className={styles.role}>{t('assistant.role')}</span>
        </div>
        {mode === 'onboarding' && (
          <button
            type="button"
            className={styles.skip}
            onClick={() => void app.savePreferences(DEFAULT_PREFERENCES).then(() => navigate('/chat', { replace: true }))}
          >
            {t('common.skip')}
          </button>
        )}
      </header>
      {showIntro && (
        <div className={styles.strip}>
          <div className={styles.stripRow}>
            <button type="button" className={styles.stripToggle} aria-expanded={stripOpen} aria-controls="dock-prefs" onClick={() => setStripOpen((o) => !o)}>
              {stripOpen ? <ChevronDownIcon /> : <ChevronRightIcon size={18} />}
              {t('desktop.prefsStrip')}
            </button>
            <Link to="/preferences" className={styles.stripChange}>
              {t('common.change')}
            </Link>
          </div>
          <div id="dock-prefs" hidden={!stripOpen} className={styles.stripChips}>
            {preferenceChips(prefs).map((c, i) => (
              <Chip key={`${c}-${i}`}>{c}</Chip>
            ))}
          </div>
        </div>
      )}
      <MessageList
        messages={thread}
        pending={pending[mode]}
        liveId={liveId}
        renderReply={renderReply}
        renderOther={renderOther}
        after={intro}
        className={styles.logWrap}
        logClassName={styles.log}
      />
      <div className={styles.inputWrap}>
        <ChatInput ref={input} className={styles.input} placeholder={placeholder} disabled={pending[mode]} onSend={onSend} />
      </div>
    </div>
  )
}
