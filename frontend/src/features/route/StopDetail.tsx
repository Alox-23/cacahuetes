/* Detalle de lugar content (Lugar.html): dev's StopPage markup and actions; navigation comes from the host. */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Chip, Sheet } from '../../components'
import { interestLabel, legLabel } from '../../assistant/format'
import type { Place, Route } from '../../contract/types'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { hintsOf } from '../../lib/placeHints'
import { activityLabel } from '../../lib/routeText'
import { lowerFirst, normalize } from '../../lib/text'
import { useData } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import styles from './StopDetail.module.css'

const MASCOT = '/mascot/cacahuete.svg'

type StopDetailProps = {
  route: Route
  order: number
  layout?: 'mobile' | 'desktop'
  /** The route after lock / unlock. */
  onRouteChange: (route: Route) => void
  /** After "Quitar" removed the stop. */
  onRemoved: () => void
  /** "Cambiar" → alternatives. */
  onChangeStop: () => void
  /** Mobile: floating back over the photo. */
  photoOverlay?: ReactNode
}

export function StopDetail({ route, order, layout: where = 'mobile', onRouteChange, onRemoved, onChangeStop, photoOverlay }: StopDetailProps) {
  const data = useData()
  const stop = route.stops.find((s) => s.order === order)
  const [place, setPlace] = useState<Place | null>(null)
  const [busy, setBusy] = useState(false)
  // placeId whose photo failed to load: show the mascot instead (only once, so no onError loop).
  const [photoFailed, setPhotoFailed] = useState<string | null>(null)

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

  if (!stop) return <p className={layout.muted}>{t('stop.notFound')}</p>

  const activity = hintsOf(place ?? undefined).activity
  const isPause = activity === 'pause'
  const must = route.request.mustInclude.some((m) => normalize(m) === normalize(stop.name))
  const onlyStop = route.stops.length <= 1
  const removeHint = stop.locked ? t('stop.lockedHint') : onlyStop ? t('stop.lastHint') : null
  const hintId = `stop-remove-hint-${where}`
  const fallback = photoFailed === stop.placeId

  async function act(fn: () => Promise<Route>, after?: () => void) {
    if (busy) return
    setBusy(true)
    try {
      const next = await fn()
      if (after) after()
      else onRouteChange(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cx(where === 'desktop' && styles.desktop)} style={where === 'mobile' ? { display: 'contents' } : undefined}>
      <div className={styles.photo}>
        <img
          src={fallback ? MASCOT : `/places/${encodeURIComponent(stop.placeId)}.jpg`}
          alt={stop.name}
          className={cx(styles.photoImg, fallback && styles.photoFallback)}
          onError={() => {
            if (!fallback) setPhotoFailed(stop.placeId)
          }}
        />
        {photoOverlay}
        {place?.rating ? (
          <div className={styles.photoRating}>
            <span className={styles.star} aria-hidden="true">
              ★
            </span>
            <span className={styles.ratingScore}>{place.rating.toFixed(1)}</span>
            {place.reviewsCount ? <span className={styles.ratingCount}>({place.reviewsCount.toLocaleString('es-ES')})</span> : null}
          </div>
        ) : null}
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
              <span className={styles.partnerBadge}>{t('stop.partner')}</span>
              {place.partnerPerk && <span className={styles.partnerPerk}>{place.partnerPerk}</span>}
            </div>
          )}
          {place?.address && (
            <div className={styles.addressRow}>
              <span className={styles.addressText}>📍 {place.address}</span>
              {place.googleMapsUrl && (
                <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
                  {t('stop.openMaps')}
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
              <Button variant="secondary" className={styles.pairButton} disabled={busy} onClick={onChangeStop}>
                {t('stop.change')}
              </Button>
            )}
            <Button
              variant="secondary"
              className={styles.pairButton}
              disabled={busy || Boolean(removeHint)}
              aria-describedby={removeHint ? hintId : undefined}
              onClick={() => act(() => data.refineRoute(route.id, { type: 'remove_stop', order: stop.order }), onRemoved)}
            >
              {t('stop.remove')}
            </Button>
          </div>
          {removeHint && (
            <p id={hintId} className={styles.hint}>
              {removeHint}
            </p>
          )}
          <Button fullWidth disabled={busy} onClick={() => act(() => data.refineRoute(route.id, { type: 'lock_stop', order: stop.order }))}>
            {stop.locked ? t('stop.unlock') : t('stop.lock')}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
