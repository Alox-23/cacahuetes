/* Cambiar parada (CambiarParada.html): mobile wrapper around the alternatives content (features/route). */
import { useParams } from 'react-router-dom'
import { Header, Screen } from '../components'
import { AlternativesList } from '../features/route/AlternativesList'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'
import { useReturnToRoute, useRoute } from './routeHooks'

export function AlternativesPage() {
  const { id = '', order: orderParam = '' } = useParams()
  const order = Number(orderParam)
  const back = useBack(`/route/${id}/stop/${order}`)
  const returnToRoute = useReturnToRoute(id)
  const { state, route } = useRoute(id)
  const stop = route?.stops.find((s) => s.order === order)

  if (state.status === 'missing' || (route && !stop)) {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} />
        <p className={layout.muted}>{state.status === 'missing' ? t('route.notFound') : t('stop.notFound')}</p>
      </Screen>
    )
  }
  if (!route || !stop) return null

  return (
    <Screen fixed className={layout.page}>
      <AlternativesList
        route={route}
        order={order}
        onDone={returnToRoute}
        top={
          <>
            <p className={layout.muted}>{t('alternatives.note')}</p>
            <Header onBack={back} label={t('alternatives.header')} className={layout.header} />
            <div className={layout.titleBlock}>
              <h1 className={`${layout.h1} ${layout.h1Small}`}>{t('alternatives.title', { name: stop.name })}</h1>
              <p className={layout.subtitle}>{t('alternatives.subtitle')}</p>
            </div>
          </>
        }
      />
    </Screen>
  )
}
