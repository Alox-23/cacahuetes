/* Valorar ruta (Valorar.html): mobile wrapper around the rating form (features/myRoutes). */
import { useNavigate, useParams } from 'react-router-dom'
import { Header, Screen } from '../components'
import { formatDateShort } from '../assistant/format'
import { RateForm } from '../features/myRoutes/RateForm'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'
import { useRoute } from './routeHooks'

export function RatePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const back = useBack(`/my-routes/${id}`)
  const { state, route } = useRoute(id)

  if (state.status === 'missing') {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} label={t('rate.header')} />
        <p className={layout.muted}>{t('savedRoute.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

  return (
    <Screen fixed className={layout.page}>
      <RateForm
        route={route}
        onDone={() => navigate(`/my-routes/${route.id}`, { replace: true })}
        top={
          <>
            <Header onBack={back} label={t('rate.header')} className={layout.header} />
            <div className={layout.titleBlock}>
              <h1 className={`${layout.h1} ${layout.h1Small}`}>{t('rate.title')}</h1>
              <p className={layout.subtitle}>{t('rate.subtitle', { name: route.name, date: formatDateShort(route.request.date, false) })}</p>
            </div>
          </>
        }
      />
    </Screen>
  )
}
