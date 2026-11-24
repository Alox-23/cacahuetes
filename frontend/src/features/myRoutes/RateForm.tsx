/* Valorar ruta content (Valorar.html): dev's stars, per-stop yes/no and comment; prefilled from getRating. */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, OptionChip, StarRating, Textarea } from '../../components'
import type { Route } from '../../contract/types'
import { t } from '../../i18n'
import { useData, useToast } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import styles from './RateForm.module.css'

type RateFormProps = {
  route: Route
  layout?: 'mobile' | 'desktop'
  /** After the rating was sent. */
  onDone: () => void
  /** Mobile: header and titles at the top of the body. */
  top?: ReactNode
}

export function RateForm({ route, layout: where = 'mobile', onDone, top }: RateFormProps) {
  const data = useData()
  const toast = useToast()
  const [loaded, setLoaded] = useState(false)
  const [stars, setStars] = useState(0)
  const [stops, setStops] = useState<Record<number, boolean>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const id = route.id

  useEffect(() => {
    let alive = true
    data.getRating(id).then(
      (rating) => {
        if (!alive) return
        if (rating) {
          setStars(rating.stars)
          setStops(rating.stops)
          setComment(rating.comment ?? '')
        }
        setLoaded(true)
      },
      () => alive && setLoaded(true),
    )
    return () => {
      alive = false
    }
  }, [data, id])

  if (!loaded) return null

  function answer(order: number, liked: boolean) {
    setStops((prev) => {
      const next = { ...prev }
      if (next[order] === liked) delete next[order]
      else next[order] = liked
      return next
    })
  }

  async function submit() {
    if (stars === 0) return
    setBusy(true)
    try {
      const text = comment.trim()
      await data.rateRoute(route.id, { stars, stops, ...(text ? { comment: text } : {}) })
      toast.show(t('toast.rated'))
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const hintId = `rate-hint-${where}`
  const fields = (
    <>
      <StarRating value={stars} onChange={setStars} label={t('rate.starsLabel')} />
      <h2 className={layout.sectionTitle}>{t('rate.stopsTitle')}</h2>
      <ul className={styles.stops}>
        {route.stops.map((stop) => (
          <li key={`${stop.order}-${stop.placeId}`} className={styles.stop}>
            <span className={styles.stopName}>{stop.name}</span>
            <span className={styles.pair} role="group" aria-label={t('rate.stopLabel', { name: stop.name })}>
              <OptionChip className={styles.yesNo} selected={stops[stop.order] === true} onToggle={() => answer(stop.order, true)}>
                {t('common.yes')}
              </OptionChip>
              <OptionChip className={styles.yesNo} selected={stops[stop.order] === false} onToggle={() => answer(stop.order, false)}>
                {t('common.no')}
              </OptionChip>
            </span>
          </li>
        ))}
      </ul>
      <Textarea
        label={t('rate.comment')}
        labelHint={t('common.optional')}
        rows={2}
        placeholder={t('rate.commentPlaceholder')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
    </>
  )
  const footer = (
    <>
      {stars === 0 && (
        <p id={hintId} className={styles.hint}>
          {t('rate.hint')}
        </p>
      )}
      <Button fullWidth disabled={stars === 0 || busy} aria-describedby={stars === 0 ? hintId : undefined} onClick={() => void submit()}>
        {t('rate.submit')}
      </Button>
    </>
  )

  if (where === 'desktop') {
    return (
      <div className={styles.desktop}>
        {fields}
        {footer}
      </div>
    )
  }
  return (
    <>
      <div className={`${layout.body} ${layout.gap18}`}>
        {top}
        {fields}
      </div>
      <div className={layout.footer}>{footer}</div>
    </>
  )
}
