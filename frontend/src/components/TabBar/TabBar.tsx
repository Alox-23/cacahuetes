import { NavLink } from 'react-router-dom'
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
  return (
    <nav aria-label={t('tabs.label')} className={cx(styles.bar, className)}>
      {TABS.map(({ key, to, label, Icon }) => (
        <NavLink
          key={key}
          to={to}
          aria-current={active ? (active === key ? 'page' : undefined) : undefined}
          className={({ isActive }) => cx(styles.tab, (active ? active === key : isActive) && styles.active)}
        >
          <Icon />
          <span>{label()}</span>
        </NavLink>
      ))}
    </nav>
  )
}
