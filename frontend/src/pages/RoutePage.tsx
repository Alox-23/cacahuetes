/* Ruta (Ruta.html): mobile wrapper around the route content (features/route). */
import { useParams } from 'react-router-dom'
import { FloatingBackButton, Header, Screen } from '../components'
import { RouteViewMobile } from '../features/route/RouteView'
import { useRouteScreen } from '../features/route/useRouteScreen'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import { usePreferences } from '../state/AppState'
import layout from './layout.module.css'

export function RoutePage() {
  const { id = '' } = useParams()
  const { preferences } = usePreferences()
  const back = useBack('/chat')
  const screen = useRouteScreen(id)
  const { state, route } = screen

  if (state.status === 'missing') {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} backLabel={t('route.backToChat')} />
        <p className={layout.muted}>{t('route.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

  return (
    <Screen fixed className={layout.page}>
      <RouteViewMobile
        route={route}
        places={screen.places}
        preferences={preferences}
        busy={screen.busy}
        onQuick={(value) => void screen.refine({ type: 'quick', value })}
        onUndo={() => void screen.undo()}
        onSave={() => void screen.save(route)}
        onShare={() => void screen.share(route)}
        mapOverlay={<FloatingBackButton onClick={back} />}
      />
    </Screen>
  )
}
