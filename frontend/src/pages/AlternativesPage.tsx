/* Cambiar parada (CambiarParada.html): three equivalent places and "Usar esta parada". */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlternativeOption, Button, Header, Screen } from '../components'
import { interestLabel, legLabel } from '../assistant/format'
import type { Place } from '../contract/types'
import { t } from '../i18n'
import { hintsOf } from '../lib/placeHints'
import { formatVisit } from '../lib/routeText'
import { useBack } from '../lib/useBack'
import { useData } from '../state/AppState'
import layout from './layout.module.css'
import { useReturnToRoute, useRoute } from './routeHooks'
import styles from './AlternativesPage.module.css'

/** "Arquitectura · visita 50 min · 6 min a pie" (parts without data are skipped). */
function optionDetail(place: Place): string {
  const hints = hintsOf(place)
  return [
    place.categories[0] ? interestLabel(place.categories[0]) : null,
    hints.visitMinutes ? t('alternatives.visit', { duration: formatVisit(hints.visitMinutes) }) : null,
    hints.travel ? legLabel(hints.travel) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function AlternativesPage() {
  const { id = '', order: orderParam = '' } = useParams()
  const order = Number(orderParam)
  const data = useData()
  const back = useBack(`/route/${id}/stop/${order}`)
  const returnToRoute = useReturnToRoute(id)
  const { state, route } = useRoute(id)
  const stop = route?.stops.find((s) => s.order === order)
  const [options, setOptions] = useState<Place[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    data.getAlternatives(id, order).then(
      (list) => {
        if (!alive) return
        setOptions(list)
        setSelected(list[0]?.id ?? null)
      },
      () => alive && setOptions([]),
    )
    return () => {
      alive = false
    }
  }, [data, id, order])

  if (state.status === 'missing' || (route && !stop)) {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} />
        <p className={layout.muted}>{state.status === 'missing' ? t('route.notFound') : t('stop.notFound')}</p>
      </Screen>
    )
  }
  if (!route || !stop || !options) return null

  async function use() {
    if (!selected || busy) return
    setBusy(true)
    try {
      await data.refineRoute(id, { type: 'swap_stop', order, placeId: selected })
      returnToRoute()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <p className={layout.muted}>{t('alternatives.note')}</p>
        <Header onBack={back} label={t('alternatives.header')} className={layout.header} />
        <div className={layout.titleBlock}>
          <h1 className={`${layout.h1} ${layout.h1Small}`}>{t('alternatives.title', { name: stop.name })}</h1>
          <p className={layout.subtitle}>{t('alternatives.subtitle')}</p>
        </div>
        <div className={layout.spacer} />
        {options.length > 0 ? (
          <div className={styles.options} role="group" aria-label={t('alternatives.listLabel')}>
            {options.map((p) => (
              <AlternativeOption key={p.id} name={p.name} detail={optionDetail(p)} selected={p.id === selected} onSelect={() => setSelected(p.id)} />
            ))}
          </div>
        ) : (
          <p className={layout.muted}>{t('alternatives.none')}</p>
        )}
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={!selected || busy} onClick={() => void use()}>
          {t('alternatives.use')}
        </Button>
      </div>
    </Screen>
  )
}
