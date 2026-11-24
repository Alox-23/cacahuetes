import { Link, useLocation } from 'react-router-dom'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import { AssistantTabIcon, ProfileTabIcon, RoutesTabIcon } from '../icons/icons'
import styles from './TabBar.module.css'

export type TabKey = 'assistant' | 'routes' | 'profile'

const TABS = [
  { key: 'assistant', to: '/chat', label: () => t('tabs.assistant'), Icon: AssistantTabIcon },
  { key: 'routes', to: '/my-routes', label: () => t('tabs.myRoutes'), Icon: RoutesTabIcon },
  { key: 'profile', to: '/profile', label: () => t('tabs.profile'), Icon: ProfileTabIcon },
] as const

type TabBarProps = {
  /** Highlighted tab; defaults to the one matching the URL. */
  active?: TabKey
  className?: string
}

export function TabBar({ active, className }: TabBarProps) {
  const { pathname } = useLocation()
  // Link (not NavLink): NavLink drops aria-current when the URL is not under `to`,
  // and mapped sections (/route/*, /preferences, /login…) must still announce their tab.
  const isOn = (key: TabKey, to: string) => (active ? active === key : pathname === to || pathname.startsWith(`${to}/`))
  return (
    <nav aria-label={t('tabs.label')} className={cx(styles.bar, className)}>
      {TABS.map(({ key, to, label, Icon }) => (
        <Link key={key} to={to} aria-current={isOn(key, to) ? 'page' : undefined} className={cx(styles.tab, isOn(key, to) && styles.active)}>
          <Icon />
          <span>{label()}</span>
        </Link>
      ))}
    </nav>
  )
}
