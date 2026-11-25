/* Ruta guardada content (RutaGuardada.html / DeskMisRutas.html). The mobile parts are dev's SavedRoutePage markup. */
import { useNavigate } from 'react-router-dom'
import { Button, Card, ConfirmSheet, RouteMap, StarIcon, StopRow } from '../../components'
import { formatDateShort } from '../../assistant/format'
import type { Route } from '../../contract/types'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { activityLabel, routeTimeRange, stopDetail, stopsCount } from '../../lib/routeText'
import { lowerFirst } from '../../lib/text'
import layout from '../../pages/layout.module.css'
import { activityFor } from '../../pages/routeHooks'
import type { SavedRouteScreen } from './useSavedRouteScreen'
import styles from './SavedRouteView.module.css'
import desk from './SavedRouteViewDesktop.module.css'

/** "Favorita" toggle (aria-pressed), in the mobile header and the desktop title row. */
export function FavoriteToggle({ route, screen }: { route: Route; screen: SavedRouteScreen }) {
  return (
    <button type="button" aria-pressed={route.favorite} className={cx(styles.favorite, route.favorite && styles.favoriteOn)} onClick={() => void screen.toggleFavorite(route)}>
      {route.favorite && <StarIcon size={18} filled />}
      {t('savedRoute.favorite')}
    </button>
  )
}

function DeleteConfirm({ route, screen }: { route: Route; screen: SavedRouteScreen }) {
  return (
    <ConfirmSheet
      open={screen.confirming}
      busy={screen.busy}
      title={t('confirm.deleteRouteTitle')}
      text={t('confirm.deleteRouteText')}
      confirmLabel={t('confirm.deleteRouteConfirm')}
      onConfirm={() => void screen.remove(route)}
      onCancel={() => screen.setConfirming(false)}
    />
  )
}

/** Mobile body and footer (the page adds the header). */
export function SavedRouteViewMobile({ route, screen }: { route: Route; screen: SavedRouteScreen }) {
  const navigate = useNavigate()
  return (
    <>
      <div className={`${layout.body} ${layout.gap14} ${styles.body}`}>
        <RouteMap stops={screen.mapStops} variant="card" routeId={route.id} label={t('routeScreen.mapLabelPlain')} />
        <div className={layout.titleBlock}>
          <h1 className={`${layout.h1} ${layout.h1Route}`}>{route.name}</h1>
          <p className={layout.subtitle}>
            {t('savedRoute.subtitle', { date: formatDateShort(route.request.date), time: routeTimeRange(route), stops: stopsCount(route.stops.length) })}
          </p>
        </div>
        <Card className={layout.stopsCard}>
          <ol className={styles.stops} aria-label={t('savedRoute.stopsLabel')}>
            {route.stops.map((stop, i) => (
              <li key={`${stop.order}-${stop.placeId}`}>
                <StopRow
                  size="md"
                  order={stop.order}
                  name={stop.name}
                  detail={activityLabel(stop, activityFor(screen.places, stop.placeId))}
                  time={stop.arrive}
                  last={i === route.stops.length - 1}
                />
              </li>
            ))}
          </ol>
        </Card>
        <div className={styles.grid} role="group" aria-label={t('savedRoute.actionsLabel')}>
          <button type="button" className={styles.action} onClick={() => screen.reuse(route)}>
            {t('savedRoute.reuse')}
          </button>
          <button type="button" className={styles.action} onClick={() => void screen.share(route)}>
            {t('savedRoute.share')}
          </button>
          <button type="button" className={styles.action} onClick={() => navigate(`/my-routes/${route.id}/rate`)}>
            {t('savedRoute.rate')}
          </button>
        </div>
      </div>
      <div className={`${layout.footer} ${styles.footer}`}>
        <Button fullWidth to={`/route/${route.id}`}>
          {t('savedRoute.start')}
        </Button>
        <button type="button" className={`${layout.textAction} ${layout.danger}`} onClick={() => screen.setConfirming(true)}>
          {t('savedRoute.delete')}
        </button>
      </div>
      <DeleteConfirm route={route} screen={screen} />
    </>
  )
}

/** Desktop panel (DeskMisRutas.html): map on top, "Guardada · …", the four actions in a row, stops, delete. */
export function SavedRouteViewDesktop({ route, screen }: { route: Route; screen: SavedRouteScreen }) {
  const navigate = useNavigate()
  return (
    <div className={desk.view}>
      <RouteMap stops={screen.mapStops} variant="wide" routeId={route.id} label={t('routeScreen.mapLabelPlain')} className={desk.map} />
      <div className={desk.body}>
        <div className={desk.headRow}>
          <div className={layout.titleBlock}>
            <h1 className={layout.h1}>{route.name}</h1>
            <p className={layout.subtitle}>
              {t('desktop.savedMeta', {
                date: lowerFirst(formatDateShort(route.request.date)),
                time: routeTimeRange(route),
                stops: stopsCount(route.stops.length),
              })}
            </p>
          </div>
          <FavoriteToggle route={route} screen={screen} />
        </div>
        <div className={desk.buttons} role="group" aria-label={t('savedRoute.actionsLabel')}>
          <Button to={`/route/${route.id}`} className={desk.medium}>
            {t('savedRoute.start')}
          </Button>
          <Button variant="secondary" className={desk.medium} onClick={() => screen.reuse(route)}>
            {t('savedRoute.reuse')}
          </Button>
          <Button variant="secondary" className={desk.medium} onClick={() => void screen.share(route)}>
            {t('savedRoute.share')}
          </Button>
          <Button variant="secondary" className={desk.medium} onClick={() => navigate(`/my-routes/${route.id}/rate`)}>
            {t('savedRoute.rate')}
          </Button>
        </div>
        <ol className={desk.stops} aria-label={t('savedRoute.stopsLabel')}>
          {route.stops.map((stop, i) => (
            <li key={`${stop.order}-${stop.placeId}`}>
              <StopRow
                size="md"
                order={stop.order}
                name={stop.name}
                detail={stopDetail(stop, activityFor(screen.places, stop.placeId))}
                time={stop.arrive}
                last={i === route.stops.length - 1}
              />
            </li>
          ))}
        </ol>
        <button type="button" className={`${layout.textAction} ${layout.start} ${layout.danger}`} onClick={() => screen.setConfirming(true)}>
          {t('savedRoute.delete')}
        </button>
      </div>
      <DeleteConfirm route={route} screen={screen} />
    </div>
  )
}
