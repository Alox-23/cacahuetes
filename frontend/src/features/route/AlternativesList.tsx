/* Cambiar parada content (CambiarParada.html): dev's AlternativesPage options and "Usar esta parada". */
import { useEffect, useState, type ReactNode } from 'react'
import { AlternativeOption, Button } from '../../components'
import { interestLabel, legLabel } from '../../assistant/format'
import type { Place, Route } from '../../contract/types'
import { t } from '../../i18n'
import { hintsOf } from '../../lib/placeHints'
import { formatVisit } from '../../lib/routeText'
import { useData } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import styles from './AlternativesList.module.css'

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

type AlternativesListProps = {
  route: Route
  order: number
  layout?: 'mobile' | 'desktop'
  /** After "Usar esta parada" swapped the stop. */
  onDone: () => void
  /** Mobile: note, header and titles above the options. */
  top?: ReactNode
}

export function AlternativesList({ route, order, layout: where = 'mobile', onDone, top }: AlternativesListProps) {
  const data = useData()
  const [options, setOptions] = useState<Place[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = route.id

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

  if (!options) return null

  async function use() {
    if (!selected || busy) return
    setBusy(true)
    try {
      await data.refineRoute(id, { type: 'swap_stop', order, placeId: selected })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const list =
    options.length > 0 ? (
      <div className={styles.options} role="group" aria-label={t('alternatives.listLabel')}>
        {options.map((p) => (
          <AlternativeOption key={p.id} name={p.name} detail={optionDetail(p)} selected={p.id === selected} onSelect={() => setSelected(p.id)} />
        ))}
      </div>
    ) : (
      <p className={layout.muted}>{t('alternatives.none')}</p>
    )
  const use_ = (
    <Button fullWidth disabled={!selected || busy} onClick={() => void use()}>
      {t('alternatives.use')}
    </Button>
  )

  if (where === 'desktop') {
    return (
      <div className={styles.desktop}>
        <p className={layout.muted}>{t('alternatives.note')}</p>
        <p className={layout.subtitle}>{t('alternatives.subtitle')}</p>
        {list}
        {use_}
      </div>
    )
  }
  return (
    <>
      <div className={layout.body}>
        {top}
        <div className={layout.spacer} />
        {list}
      </div>
      <div className={layout.footer}>{use_}</div>
    </>
  )
}
