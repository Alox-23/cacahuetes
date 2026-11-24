import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { tabForPath } from '../../lib/tabs'
import { TabBar, type TabKey } from '../TabBar/TabBar'
import styles from './Screen.module.css'

type ScreenProps = {
  children: ReactNode
  /** Which tab is highlighted; defaults to the one matching the URL section. */
  tabBar?: TabKey
  /** Padding shorthand for the content column (default none). */
  padding?: string
  /** Fixed viewport height with an inner scroll area (chat screens). */
  fixed?: boolean
  className?: string
}

/** App frame column: min-height 100dvh, content grows, persistent tab bar at the bottom. */
export function Screen({ children, tabBar, padding, fixed = false, className }: ScreenProps) {
  const { pathname } = useLocation()
  return (
    <div className={cx(styles.screen, fixed && styles.fixed)}>
      <main className={cx(styles.content, className)} style={padding ? { padding } : undefined}>
        {children}
      </main>
      <TabBar active={tabBar ?? tabForPath(pathname)} />
    </div>
  )
}
