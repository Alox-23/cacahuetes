/* Ruta guardada (RutaGuardada.html): mobile wrapper around the saved route content (features/myRoutes). */
import { useParams } from 'react-router-dom'
import { Header, Screen } from '../components'
import { FavoriteToggle, SavedRouteViewMobile } from '../features/myRoutes/SavedRouteView'
import styles from '../features/myRoutes/SavedRouteView.module.css'
import { useSavedRouteScreen } from '../features/myRoutes/useSavedRouteScreen'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'

export function SavedRoutePage() {
  const { id = '' } = useParams()
  const back = useBack('/my-routes')
  const screen = useSavedRouteScreen(id)
  const { route } = screen

  if (screen.missing) {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} label={t('savedRoute.header')} />
        <p className={layout.muted}>{t('savedRoute.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

  return (
    <Screen fixed className={layout.page}>
      <div className={styles.headerArea}>
        <Header onBack={back} label={t('savedRoute.header')} right={<FavoriteToggle route={route} screen={screen} />} />
      </div>
      <SavedRouteViewMobile route={route} screen={screen} />
    </Screen>
  )
}
