/* Mis rutas (MisRutas.html / MisRutasVacio.html): search, Próximas/Pasadas/Favoritas and route cards. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, RouteMap, Screen, SearchField, SegmentedControl } from '../components'
import type { Route } from '../contract/types'
import { t } from '../i18n'
import { filterRoutes, type RoutesTab } from '../lib/routeFilters'
import { routeTags, routeWhen, stopsCount } from '../lib/routeText'
import { useData, usePreferences, useSession } from '../state/AppState'
import layout from './layout.module.css'
import styles from './MyRoutesPage.module.css'

/** Four decorative stops for the empty-state map. */
const EMPTY_MAP_STOPS = [{ order: 1 }, { order: 2 }, { order: 3 }, { order: 4 }]

export function MyRoutesPage() {
  const data = useData()
  const { session } = useSession()
  const { preferences } = usePreferences()
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [tab, setTab] = useState<RoutesTab>('upcoming')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    data.listRoutes().then(
      (list) => alive && setRoutes(list),
      () => alive && setRoutes([]),
    )
    return () => {
      alive = false
    }
  }, [data, session])

  if (!routes) return <Screen>{null}</Screen>

  if (routes.length === 0) {
    return (
      <Screen className={styles.page}>
        <div className={styles.titleRow}>
          <h1 className={layout.h1}>{t('myRoutes.title')}</h1>
        </div>
        <div className={styles.empty}>
          <RouteMap stops={EMPTY_MAP_STOPS} variant="card" height={170} label={t('routeScreen.mapLabelPlain')} />
          <div className={styles.emptyText}>
            <h2 className={styles.emptyTitle}>{t('myRoutes.emptyTitle')}</h2>
            <p className={layout.subtitle}>{t('myRoutes.emptyText')}</p>
          </div>
          <Button fullWidth to="/chat">
            {t('myRoutes.emptyCta')}
          </Button>
        </div>
      </Screen>
    )
  }

  const visible = filterRoutes(routes, tab, query)
  return (
    <Screen className={`${styles.page} ${styles.list}`}>
      <div className={styles.titleRow}>
        <h1 className={layout.h1}>{t('myRoutes.title')}</h1>
      </div>
      <SearchField label={t('myRoutes.searchLabel')} placeholder={t('myRoutes.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <SegmentedControl
        label={t('myRoutes.tabsLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: t('myRoutes.upcoming') },
          { value: 'past', label: t('myRoutes.past') },
          { value: 'favorites', label: t('myRoutes.favorites') },
        ]}
      />
      {visible.length === 0 ? (
        <p className={layout.muted}>{t('myRoutes.none')}</p>
      ) : (
        <ul className={styles.cards} aria-label={t('myRoutes.listLabel')}>
          {visible.map((route) => (
            <li key={route.id}>
              <Link to={`/my-routes/${route.id}`} className={styles.card}>
                <RouteMap stops={route.stops} variant="thumb" />
                <span className={styles.cardText}>
                  <span className={styles.cardName}>{route.name}</span>
                  <span className={styles.cardMeta}>{routeWhen(route)}</span>
                  <span className={styles.cardMeta}>{t('myRoutes.cardMeta', { stops: stopsCount(route.stops.length), tags: routeTags(route, preferences) })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
