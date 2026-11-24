import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChatIcon, ChevronDownIcon, ChevronRightIcon, Mascot, ProfileTabIcon, RoutesTabIcon } from '../components'
import { formatDateShort } from '../assistant/format'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { tabForPath } from '../lib/tabs'
import { useSavedRoutes, useSession } from '../state/AppState'
import { panelFor } from './desktopPaths'
import styles from './Sidebar.module.css'

/** Desktop navigation (replaces the tab bar): Asistente, the Mis rutas disclosure, Perfil and the account. */
export function Sidebar({ contextPath }: { contextPath: string }) {
  const { pathname } = useLocation()
  const section = tabForPath(contextPath)
  const { routes } = useSavedRoutes()
  const { session } = useSession()
  const inRoutes = section === 'routes'
  const [open, setOpen] = useState(inRoutes)
  // Open automatically on /my-routes*.
  useEffect(() => {
    if (inRoutes) setOpen(true)
  }, [inRoutes])
  const panel = panelFor(contextPath)
  const currentSaved = panel?.kind === 'saved' ? panel.id : null
  const name = session.name || t('account.namePlaceholder')

  return (
    <nav aria-label={t('tabs.label')} className={styles.sidebar}>
      <div className={styles.brand}>
        <Mascot size={34} />
        {t('app.name')}
      </div>
      <Link to="/chat" className={cx(styles.item, section === 'assistant' && styles.active)} aria-current={section === 'assistant' ? 'page' : undefined}>
        <ChatIcon />
        <span className={styles.grow}>{t('tabs.assistant')}</span>
      </Link>
      <button
        type="button"
        className={cx(styles.item, inRoutes && styles.active)}
        aria-expanded={open}
        aria-controls="sidebar-routes"
        aria-current={inRoutes ? 'page' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <RoutesTabIcon size={22} />
        <span className={styles.grow}>{t('desktop.routesToggle')}</span>
        {open ? <ChevronDownIcon /> : <ChevronRightIcon size={18} />}
      </button>
      <div id="sidebar-routes" hidden={!open} className={styles.routes}>
        {routes.length === 0 ? (
          <p className={styles.empty}>{t('desktop.noRoutes')}</p>
        ) : (
          <ul className={styles.routeList}>
            {routes.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/my-routes/${r.id}`}
                  className={cx(styles.route, currentSaved === r.id && styles.routeCurrent)}
                  aria-current={currentSaved === r.id ? 'true' : undefined}
                >
                  <span className={styles.routeName}>{r.name}</span>
                  <span className={styles.routeDate}>{formatDateShort(r.request.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link to="/profile" className={cx(styles.item, section === 'profile' && styles.active)} aria-current={section === 'profile' ? 'page' : undefined}>
        <ProfileTabIcon size={22} />
        <span className={styles.grow}>{t('tabs.profile')}</span>
      </Link>
      <div className={styles.account}>
        {session.kind === 'account' ? (
          <Link to="/profile" className={styles.accountLink}>
            <span className={styles.avatar} aria-hidden="true">
              {name.charAt(0).toLocaleUpperCase('es')}
            </span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{name}</span>
              <span className={styles.accountEmail}>{session.email || t('account.emailPlaceholder')}</span>
            </span>
          </Link>
        ) : (
          <Link to="/login" state={{ background: pathname }} className={styles.enter}>
            {t('desktop.enter')}
          </Link>
        )}
      </div>
    </nav>
  )
}
