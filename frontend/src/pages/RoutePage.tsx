// TODO(feature-2): placeholder Route screen so the create flow ends somewhere real.
// Replaced by the real Ruta screen (map, Lugar, save…) in feature 2 / spec 2.
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Header, QuickReply, Screen } from '../components'
import { formatDateShort, legLabel } from '../assistant/format'
import type { Route } from '../contract/types'
import { t, tDynamic } from '../i18n'
import { QUICK_REFINES } from '../lib/refineKeywords'
import { routeEnd } from '../lib/route'
import { useCurrentRoute, useData, usePendingRequest } from '../state/AppState'
import styles from './RoutePage.module.css'

export function RoutePage() {
  const { id = '' } = useParams()
  const data = useData()
  const { setCurrentRouteId } = useCurrentRoute()
  const { setPendingRequest } = usePendingRequest()
  const [route, setRoute] = useState<Route | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)

  // The create flow is over once the route is on screen.
  useEffect(() => setPendingRequest(null), [setPendingRequest])

  useEffect(() => {
    let alive = true
    data.getRoute(id).then(
      (r) => {
        if (!alive) return
        setRoute(r)
        setCurrentRouteId(r.id)
      },
      () => alive && setMissing(true),
    )
    return () => {
      alive = false
    }
  }, [data, id, setCurrentRouteId])

  const run = useCallback(
    async (fn: () => Promise<Route>) => {
      if (busy) return
      setBusy(true)
      try {
        setRoute(await fn())
      } finally {
        setBusy(false)
      }
    },
    [busy],
  )

  if (missing) {
    return (
      <Screen className={styles.page}>
        <Header backTo="/chat" backLabel={t('route.backToChat')} />
        <p className={styles.muted}>{t('route.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

  const { request } = route
  return (
    <Screen className={styles.page}>
      <Header backTo="/chat" backLabel={t('route.backToChat')} title={route.name} />
      <p className={styles.meta}>
        {formatDateShort(request.date)} · {t('format.timeRange', { from: request.timeWindow.from, to: routeEnd(route) })}
        <span className={styles.version}> · {t('route.version', { version: route.version })}</span>
      </p>

      <section aria-label={t('route.stopsLabel')}>
        <ol className={styles.stops}>
          {route.stops.map((stop) => (
            <Fragment key={`${stop.order}-${stop.placeId}`}>
              <li className={styles.stop}>
                <span className={styles.badge} aria-hidden="true">
                  {stop.order}
                </span>
                <div className={styles.stopText}>
                  <span className={styles.stopName}>{stop.name}</span>
                  <span className={styles.muted}>
                    {t('route.arrive', { time: stop.arrive })} · {t('route.visit', { minutes: stop.visitMinutes })}
                    {stop.locked ? ` · ${t('route.locked')}` : ''}
                  </span>
                  {stop.travelToNext && <span className={styles.leg}>{legLabel(stop.travelToNext)}</span>}
                </div>
              </li>
            </Fragment>
          ))}
        </ol>
        <p className={styles.muted}>{t('route.ends', { time: routeEnd(route) })}</p>
      </section>

      <div className={styles.bottom}>
        <section className={styles.quick} aria-label={t('route.quickTitle')}>
          {QUICK_REFINES.map((value) => (
            <QuickReply
              key={value}
              label={tDynamic(`route.quick.${value}`)}
              disabled={busy}
              onClick={() => run(() => data.refineRoute(route.id, { type: 'quick', value }))}
            />
          ))}
        </section>
        <Button variant="secondary" fullWidth to={`/route/${route.id}/change`}>
          {t('route.askChange')}
        </Button>
        <Button variant="text" className={styles.undo} disabled={route.version === 1 || busy} onClick={() => run(() => data.undo(route.id))}>
          {t('common.undo')}
        </Button>
      </div>
    </Screen>
  )
}
