import type { ReactNode } from 'react'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { ChatDock } from './ChatDock'
import { panelFor } from './desktopPaths'
import { DesktopPanel } from './DesktopPanels'
import { Sidebar } from './Sidebar'
import styles from './DesktopShell.module.css'

/**
 * Three zones (feature 3 §4.1): sidebar 240 px, the chat (always mounted) and a
 * right panel that exists only when the URL has something to show.
 */
export function DesktopShell({ contextPath, dialog }: { contextPath: string; dialog: ReactNode }) {
  const panel = panelFor(contextPath)
  return (
    <div className={cx(styles.shell, panel && styles.withPanel)}>
      <Sidebar contextPath={contextPath} />
      <section aria-label={t('desktop.chatLabel')} className={styles.chat}>
        <ChatDock contextPath={contextPath} panel={panel} />
      </section>
      {panel && (
        <section
          aria-label={panel.kind === 'settings' ? t('desktop.panelSettings') : panel.kind === 'saved' ? t('desktop.panelSaved') : t('desktop.panelRoute')}
          className={styles.panel}
        >
          <DesktopPanel panel={panel} />
        </section>
      )}
      {dialog}
    </div>
  )
}
