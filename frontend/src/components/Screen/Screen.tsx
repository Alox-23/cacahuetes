import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { TabBar, type TabKey } from '../TabBar/TabBar'
import styles from './Screen.module.css'

type ScreenProps = {
  children: ReactNode
  /** Show the bottom tab bar with this tab active. */
  tabBar?: TabKey
  /** Padding shorthand for the content column (default none). */
  padding?: string
  /** Fixed viewport height with an inner scroll area (chat screens). */
  fixed?: boolean
  className?: string
}

/** App frame column: min-height 100dvh, content grows, tab bar at the bottom. */
export function Screen({ children, tabBar, padding, fixed = false, className }: ScreenProps) {
  return (
    <div className={cx(styles.screen, fixed && styles.fixed)}>
      <main className={cx(styles.content, className)} style={padding ? { padding } : undefined}>
        {children}
      </main>
      {tabBar && <TabBar active={tabBar} />}
    </div>
  )
}
