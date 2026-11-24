/* Valorar ruta (Valorar.html): stars, per-stop yes/no and an optional comment. */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Header, OptionChip, Screen, StarRating, Textarea } from '../components'
import { formatDateShort } from '../assistant/format'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import { useData, useToast } from '../state/AppState'
import layout from './layout.module.css'
import { useRoute } from './routeHooks'
import styles from './RatePage.module.css'

export function RatePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const data = useData()
  const toast = useToast()
  const back = useBack(`/my-routes/${id}`)
  const { state, route } = useRoute(id)
  const [loaded, setLoaded] = useState(false)
  const [stars, setStars] = useState(0)
  const [stops, setStops] = useState<Record<number, boolean>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

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

  if (state.status === 'missing') {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} label={t('rate.header')} />
        <p className={layout.muted}>{t('savedRoute.notFound')}</p>
      </Screen>
    )
  }
  if (!route || !loaded) return null

  function answer(order: number, liked: boolean) {
    setStops((prev) => {
      const next = { ...prev }
      if (next[order] === liked) delete next[order]
      else next[order] = liked
      return next
    })
  }

  async function submit() {
    if (stars === 0 || !route) return
    setBusy(true)
    try {
      const text = comment.trim()
      await data.rateRoute(route.id, { stars, stops, ...(text ? { comment: text } : {}) })
      toast.show(t('toast.rated'))
      navigate(`/my-routes/${route.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={`${layout.body} ${layout.gap18}`}>
        <Header onBack={back} label={t('rate.header')} className={layout.header} />
        <div className={layout.titleBlock}>
          <h1 className={`${layout.h1} ${layout.h1Small}`}>{t('rate.title')}</h1>
          <p className={layout.subtitle}>{t('rate.subtitle', { name: route.name, date: formatDateShort(route.request.date, false) })}</p>
        </div>
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
      </div>
      <div className={layout.footer}>
        {stars === 0 && (
          <p id="rate-hint" className={styles.hint}>
            {t('rate.hint')}
          </p>
        )}
        <Button fullWidth disabled={stars === 0 || busy} aria-describedby={stars === 0 ? 'rate-hint' : undefined} onClick={() => void submit()}>
          {t('rate.submit')}
        </Button>
      </div>
    </Screen>
  )
}
