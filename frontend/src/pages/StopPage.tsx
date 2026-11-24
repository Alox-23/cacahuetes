/* Detalle de lugar (Lugar.html): photo, why, hours, price; change, remove or lock the stop. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Chip, FloatingBackButton, Header, Screen, Sheet } from '../components'
import { interestLabel, legLabel } from '../assistant/format'
import type { Place, Route } from '../contract/types'
import { t } from '../i18n'
import { hintsOf } from '../lib/placeHints'
import { activityLabel } from '../lib/routeText'
import { lowerFirst, normalize } from '../lib/text'
import { useBack } from '../lib/useBack'
import { useData } from '../state/AppState'
import layout from './layout.module.css'
import { useNextDepth, useReturnToRoute, useRoute } from './routeHooks'
import styles from './StopPage.module.css'

export function StopPage() {
  const { id = '', order: orderParam = '' } = useParams()
  const order = Number(orderParam)
  const navigate = useNavigate()
  const data = useData()
  const back = useBack(`/route/${id}`)
  const returnToRoute = useReturnToRoute(id)
  const nextDepth = useNextDepth()
  const { state, route, setRoute } = useRoute(id)
  const stop = route?.stops.find((s) => s.order === order)
  const [place, setPlace] = useState<Place | null>(null)
  const [busy, setBusy] = useState(false)

  const placeId = stop?.placeId
  useEffect(() => {
    if (!placeId) return
    let alive = true
    data.getPlace(placeId).then(
      (p) => alive && setPlace(p),
      () => alive && setPlace(null),
    )
    return () => {
      alive = false
    }
  }, [data, placeId])

  if (state.status === 'missing' || (route && !stop)) {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} />
        <p className={layout.muted}>{state.status === 'missing' ? t('route.notFound') : t('stop.notFound')}</p>
      </Screen>
    )
  }
  if (!route || !stop) return null

  const activity = hintsOf(place ?? undefined).activity
  const isPause = activity === 'pause'
  const must = route.request.mustInclude.some((m) => normalize(m) === normalize(stop.name))
  const onlyStop = route.stops.length <= 1
  const removeHint = stop.locked ? t('stop.lockedHint') : onlyStop ? t('stop.lastHint') : null

  async function act(fn: () => Promise<Route>, after?: () => void) {
    if (busy) return
    setBusy(true)
    try {
      const next = await fn()
      if (after) after()
      else setRoute(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={styles.photo}>
        <img src={`/places/${encodeURIComponent(stop.placeId)}.jpg`} alt={stop.name} className={styles.photoImg}
          onError={event => {
            const img = event.currentTarget
            if (!img.src.endsWith('/mascot/cacahuete.svg')) {
              img.src = '/mascot/cacahuete.svg'
              img.style.objectFit = 'contain'
            }
          }} />
        <FloatingBackButton onClick={back} />
        {place?.rating && (
          <div className={styles.photoRating}>
            <span className={styles.star}>★</span>
            <span className={styles.ratingScore}>{place.rating.toFixed(1)}</span>
            <span className={styles.ratingCount}>({place.reviewsCount ? place.reviewsCount.toLocaleString('es-ES') : ''})</span>
          </div>
        )}
      </div>
      <Sheet className={styles.sheet}>
        <div className={styles.body}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{stop.name}</h1>
            <p className={layout.subtitle}>
              {t('stop.meta', { order: stop.order, time: stop.arrive, visit: lowerFirst(activityLabel(stop, activity)) })}
            </p>
          </div>
          <div className={layout.chips} aria-label={t('stop.chipsLabel')} role="group">
            {(place?.categories ?? []).map((c) => (
              <Chip key={c}>{interestLabel(c)}</Chip>
            ))}
            {must && <Chip>{t('stop.mustInclude')}</Chip>}
            {stop.locked && <Chip>{t('stop.locked')}</Chip>}
          </div>

          {place?.partner && (
            <div className={styles.partnerBanner}>
              <span className={styles.partnerBadge}>⭐ Negocio local afiliado</span>
              {place.partnerPerk && <span className={styles.partnerPerk}>{place.partnerPerk}</span>}
            </div>
          )}

          {place?.address && (
            <div className={styles.addressRow}>
              <span className={styles.addressText}>📍 {place.address}</span>
              {place.googleMapsUrl && (
                <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
                  Abrir en Google Maps ↗
                </a>
              )}
            </div>
          )}

          {place?.why && (
            <div className={styles.why}>
              <span className={styles.whyTitle}>{t('stop.why')}</span>
              <span>{place.why}</span>
            </div>
          )}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>🕒 {t('stop.hours')}</dt>
              <dd>{place?.hours ?? t('stop.hoursPlaceholder')}</dd>
            </div>
            <div className={styles.fact}>
              <dt>💶 {t('stop.price')}</dt>
              <dd>{place?.price ?? t('stop.pricePlaceholder')}</dd>
            </div>
            <div className={styles.fact}>
              <dt>🚶 {t('stop.next')}</dt>
              <dd>{stop.travelToNext ? legLabel(stop.travelToNext) : t('stop.end')}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.footer}>
          <div className={styles.pair}>
            {!isPause && (
              <Button
                variant="secondary"
                className={styles.pairButton}
                disabled={busy}
                onClick={() => navigate(`/route/${id}/stop/${stop.order}/alternatives`, { state: { depth: nextDepth } })}
              >
                {t('stop.change')}
              </Button>
            )}
            <Button
              variant="secondary"
              className={styles.pairButton}
              disabled={busy || Boolean(removeHint)}
              aria-describedby={removeHint ? 'stop-remove-hint' : undefined}
              onClick={() => act(() => data.refineRoute(id, { type: 'remove_stop', order: stop.order }), returnToRoute)}
            >
              {t('stop.remove')}
            </Button>
          </div>
          {removeHint && (
            <p id="stop-remove-hint" className={styles.hint}>
              {removeHint}
            </p>
          )}
          <Button fullWidth disabled={busy} onClick={() => act(() => data.refineRoute(id, { type: 'lock_stop', order: stop.order }))}>
            {stop.locked ? t('stop.unlock') : t('stop.lock')}
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
