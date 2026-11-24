/* Detalle de lugar (Lugar.html): mobile wrapper around the stop content (features/route). */
import { useNavigate, useParams } from 'react-router-dom'
import { FloatingBackButton, Header, Screen } from '../components'
import { StopDetail } from '../features/route/StopDetail'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'
import { useNextDepth, useReturnToRoute, useRoute } from './routeHooks'

export function StopPage() {
  const { id = '', order: orderParam = '' } = useParams()
  const order = Number(orderParam)
  const navigate = useNavigate()
  const back = useBack(`/route/${id}`)
  const returnToRoute = useReturnToRoute(id)
  const nextDepth = useNextDepth()
  const { state, route, setRoute } = useRoute(id)
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
      <StopDetail
        route={route}
        order={order}
        onRouteChange={setRoute}
        onRemoved={returnToRoute}
        onChangeStop={() => navigate(`/route/${id}/stop/${stop.order}/alternatives`, { state: { depth: nextDepth } })}
        photoOverlay={<FloatingBackButton onClick={back} />}
      />
    </Screen>
  )
}
