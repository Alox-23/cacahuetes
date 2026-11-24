import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, CheckIcon, Mascot, PendingIcon, Screen, SpinnerIcon } from '../components'
import { requestSubtitle } from '../assistant/format'
import type { Route, RouteRequest } from '../contract/types'
import { PeanutRunGame, type PeanutRunHandle, type PeanutRunState } from '../game/PeanutRunGame'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { useCurrentRoute, useData, usePendingRequest } from '../state/AppState'
import styles from './CreatingPage.module.css'

const STEPS = ['creating.step1', 'creating.step2', 'creating.step3', 'creating.step4'] as const
export const STEP_MS = 600

export function CreatingPage() {
  const { pendingRequest } = usePendingRequest()
  if (!pendingRequest) return <Navigate to="/chat" replace />
  return <CreatingRun request={pendingRequest} />
}

function CreatingRun({ request }: { request: RouteRequest }) {
  const navigate = useNavigate()
  const data = useData()
  const { setCurrentRouteId } = useCurrentRoute()
  const [active, setActive] = useState(0)
  const [route, setRoute] = useState<Route | null>(null)
  const [failed, setFailed] = useState(false)
  const [gameState, setGameState] = useState<PeanutRunState>('ready')
  const creation = useRef<Promise<Route> | null>(null)
  const game = useRef<PeanutRunHandle>(null)
  const ready = active >= STEPS.length && route !== null

  // Create once (StrictMode-safe), animate the four steps meanwhile.
  useEffect(() => {
    if (!creation.current) creation.current = data.createRoute(request)
    let alive = true
    creation.current.then(
      (r) => alive && setRoute(r),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [data, request])

  useEffect(() => {
    if (active >= STEPS.length) return
    const timer = setTimeout(() => setActive((a) => a + 1), STEP_MS)
    return () => clearTimeout(timer)
  }, [active])

  const goToRoute = useCallback(() => {
    if (!route) return
    setCurrentRouteId(route.id)
    // The pending request is cleared by the route screen once it is mounted:
    // clearing it here would let the /creating guard redirect to /chat first.
    navigate(`/route/${route.id}`, { replace: true })
  }, [route, navigate, setCurrentRouteId])

  // Never interrupt a run: only auto-navigate when the game was never started.
  // The live engine state is read too, because the polled one can lag a tap by up to 250 ms.
  const untouched = gameState === 'ready' && (game.current?.getState().state ?? 'ready') === 'ready'
  useEffect(() => {
    if (ready && untouched) goToRoute()
  }, [ready, untouched, goToRoute])

  const onExit = useCallback(() => {
    if (ready) goToRoute()
  }, [ready, goToRoute])

  const showBanner = ready && !untouched
  const shortStep = Math.min(active, STEPS.length - 1)

  return (
    <Screen className={styles.page}>
      <div className={styles.center}>
        <div className={styles.titleRow}>
          <Mascot size={56} className={cx(styles.mascot, !ready && styles.pulse)} />
          <div className={styles.titles}>
            <h1 className={styles.title}>{ready ? t('creating.titleReady') : t('creating.title')}</h1>
            <p className={styles.subtitle}>{requestSubtitle(request)}</p>
          </div>
        </div>
        {failed ? (
          <p role="alert" className={styles.subtitle}>
            {t('creating.error')}
          </p>
        ) : (
          <Card padding="12px 20px" className={styles.stepsCard}>
            <ol className={styles.steps} aria-live="polite">
              {STEPS.map((key, i) => {
                const state = i < active ? 'done' : i === active ? 'active' : 'pending'
                return (
                  <li key={key} className={cx(styles.step, state === 'active' && styles.stepActive)}>
                    <StepIcon state={state} />
                    <span>{t(key)}</span>
                    <span className="sr-only">
                      {state === 'done' ? t('creating.stateDone') : state === 'active' ? t('creating.stateActive') : t('creating.statePending')}
                    </span>
                  </li>
                )
              })}
            </ol>
            {/* Short viewports (< 700 px tall) show one line instead; the list above stays for screen readers. */}
            <p className={cx(styles.step, styles.stepActive, styles.stepShort)} aria-hidden="true">
              <StepIcon state={active >= STEPS.length ? 'done' : 'active'} />
              <span>
                {t('creating.stepShort', { index: shortStep + 1, total: STEPS.length, step: t(STEPS[shortStep]) })}
              </span>
            </p>
          </Card>
        )}
        <section className={styles.game} aria-labelledby="creating-game-label">
          <h2 id="creating-game-label" className={styles.gameLabel}>
            {t('creating.gameLabel')}
          </h2>
          <PeanutRunGame ref={game} onStateChange={setGameState} onExit={onExit} />
          <p className={styles.hint}>{t('creating.gameHint')}</p>
        </section>
      </div>
      <div className={styles.footer}>
        <div role="status">
          {showBanner && (
            <Card padding="12px 12px 12px 20px" className={styles.banner}>
              <span className={styles.bannerText}>{t('creating.readyBanner')}</span>
              <Button onClick={goToRoute}>{t('creating.viewRoute')}</Button>
            </Card>
          )}
        </div>
        {!ready && (
          <Button variant="text" className={styles.cancel} onClick={() => navigate('/chat/conversation', { replace: true })}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </Screen>
  )
}

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') return <CheckIcon className={styles.iconDone} />
  if (state === 'active') return <SpinnerIcon className={styles.iconActive} />
  return <PendingIcon className={styles.iconPending} />
}
