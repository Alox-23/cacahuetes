/*
 * Creando la ruta (mobile, Cargando.html + feature 5): the steps and a decorative chase animation while the
 * route is created. The creation itself runs in the provider (desktop feature §4.4), so the desktop chat shows
 * the same progress; this screen owns the navigation on mobile and opens the route as soon as it is ready.
 */
import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, ChaseAnimation, CheckIcon, Mascot, PendingIcon, Screen, SpinnerIcon } from '../components'
import { requestSubtitle } from '../assistant/format'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { CREATION_STEPS, STEP_MS as PROVIDER_STEP_MS, useCreation, useCurrentRoute, type Creation } from '../state/AppState'
import styles from './CreatingPage.module.css'

const STEPS = ['creating.step1', 'creating.step2', 'creating.step3', 'creating.step4'] as const
/** Time between creation steps (the provider's timer). */
export const STEP_MS = PROVIDER_STEP_MS

export function CreatingPage() {
  const { creation, cancelCreation } = useCreation()
  const navigate = useNavigate()
  // Set by Cancel: the creation is gone while the navigation to the conversation is still pending.
  const leaving = useRef(false)
  if (!creation) return leaving.current ? null : <Navigate to="/chat" replace />
  return (
    <CreatingRun
      creation={creation}
      onCancel={() => {
        leaving.current = true
        cancelCreation()
        navigate('/chat/conversation', { replace: true })
      }}
    />
  )
}

function CreatingRun({ creation, onCancel }: { creation: Creation; onCancel: () => void }) {
  const navigate = useNavigate()
  const { setCurrentRouteId } = useCurrentRoute()
  const { request } = creation
  const active = Math.min(creation.step, CREATION_STEPS)
  const failed = creation.status === 'failed'
  const route = creation.status === 'done' ? (creation.route ?? null) : null

  useEffect(() => {
    if (!route) return
    setCurrentRouteId(route.id)
    navigate(`/route/${route.id}`, { replace: true })
  }, [route, navigate, setCurrentRouteId])

  const shortStep = Math.min(active, STEPS.length - 1)

  return (
    <Screen className={styles.page}>
      <div className={styles.center}>
        <div className={styles.titleRow}>
          <Mascot size={56} className={cx(styles.mascot, !route && styles.pulse)} />
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
        <ChaseAnimation className={styles.chase} />
      </div>
      <div className={styles.footer}>
        {/* Feature 5: a route the agent already created cannot be cancelled; the steps only play it back. */}
        {!route && !creation.existing && (
          <Button variant="text" className={styles.cancel} onClick={onCancel}>
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
