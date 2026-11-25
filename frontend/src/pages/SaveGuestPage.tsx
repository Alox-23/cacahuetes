/* Guardar como invitado (GuardarInvitado.html): ask to create an account or sign in. */
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Header, RouteMap, Screen, StopRow } from '../components'
import { formatDateShort } from '../assistant/format'
import { t } from '../i18n'
import { stopsCount } from '../lib/routeText'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'
import { useRoute } from './routeHooks'
import type { AuthState } from './auth/afterSignIn'

export function SaveGuestPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const back = useBack(`/route/${id}`)
  const { state, route } = useRoute(id)

  if (state.status === 'missing') {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} />
        <p className={layout.muted}>{t('route.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

  const authState: AuthState = { returnTo: `/my-routes/${route.id}`, saveRouteId: route.id }

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header onBack={back} label={t('saveGuest.header')} className={layout.header} />
        <RouteMap stops={route.stops} variant="card" label={t('routeScreen.mapLabelPlain')} />
        <div className={layout.titleBlock}>
          <h1 className={layout.h1}>{t('saveGuest.title')}</h1>
          <p className={layout.subtitle}>{t('saveGuest.text')}</p>
        </div>
        <div className={layout.spacer} />
        <Card padding="4px 16px" className={layout.stopsCard}>
          <StopRow
            size="md"
            order={1}
            name={route.name}
            detail={t('saveGuest.meta', { stops: stopsCount(route.stops.length), date: formatDateShort(route.request.date, false) })}
            time={route.stops[0]?.arrive ?? route.request.timeWindow.from}
            last
          />
        </Card>
      </div>
      <div className={`${layout.footer} ${layout.footerTight}`}>
        <Button fullWidth onClick={() => navigate('/register', { state: authState })}>
          {t('saveGuest.create')}
        </Button>
        <Button fullWidth variant="secondary" className={layout.secondaryButton} onClick={() => navigate('/login', { state: authState })}>
          {t('saveGuest.login')}
        </Button>
        <button type="button" className={layout.textAction} onClick={back}>
          {t('saveGuest.continue')}
        </button>
      </div>
    </Screen>
  )
}
