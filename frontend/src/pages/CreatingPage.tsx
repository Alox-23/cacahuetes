import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, CheckIcon, Mascot, PendingIcon, Screen, SpinnerIcon } from '../components'
import { requestSubtitle } from '../assistant/format'
import type { Route, RouteRequest } from '../contract/types'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { useCurrentRoute, useData, usePendingRequest } from '../state/AppState'
import { LoadingMap } from './maps'
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
  const creation = useRef<Promise<Route> | null>(null)

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

  useEffect(() => {
    if (active >= STEPS.length && route) {
      setCurrentRouteId(route.id)
      // The pending request is cleared by the route screen once it is mounted:
      // clearing it here would let the /creating guard redirect to /chat first.
      navigate(`/route/${route.id}`, { replace: true })
    }
  }, [active, route, navigate, setCurrentRouteId])

  return (
    <Screen className={styles.page}>
      <div className={styles.center}>
        <LoadingMap label={t('creating.mapLabel')} />
        <div className={styles.titleRow}>
          <Mascot size={56} className={styles.pulse} />
          <div className={styles.titles}>
            <h1 className={styles.title}>{t('creating.title')}</h1>
            <p className={styles.subtitle}>{requestSubtitle(request)}</p>
          </div>
        </div>
        {failed ? (
          <p role="alert" className={styles.subtitle}>
            {t('creating.error')}
          </p>
        ) : (
          <Card padding="12px 20px">
            <ol className={styles.steps} aria-live="polite">
              {STEPS.map((key, i) => {
                const state = i < active ? 'done' : i === active ? 'active' : 'pending'
                return (
                  <li key={key} className={cx(styles.step, state === 'active' && styles.stepActive)}>
                    {state === 'done' && <CheckIcon className={styles.iconDone} />}
                    {state === 'active' && <SpinnerIcon className={styles.iconActive} />}
                    {state === 'pending' && <PendingIcon className={styles.iconPending} />}
                    <span>{t(key)}</span>
                    <span className="sr-only">
                      {state === 'done' ? t('creating.stateDone') : state === 'active' ? t('creating.stateActive') : t('creating.statePending')}
                    </span>
                  </li>
                )
              })}
            </ol>
          </Card>
        )}
      </div>
      <Button variant="text" className={styles.cancel} onClick={() => navigate('/chat/conversation', { replace: true })}>
        {t('common.cancel')}
      </Button>
    </Screen>
  )
}
