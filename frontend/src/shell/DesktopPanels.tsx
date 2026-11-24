/* Right panel of the desktop shell: route, saved route or settings, built from the extracted content components. */
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Button, ConfirmSheet, SlideOver } from '../components'
import { SavedRouteViewDesktop } from '../features/myRoutes/SavedRouteView'
import { useSavedRouteScreen } from '../features/myRoutes/useSavedRouteScreen'
import { AccountSettingsFields, PersonalFields } from '../features/profile/AccountForm'
import { PreferencesForm } from '../features/profile/PreferencesForm'
import { ProfileCard } from '../features/profile/ProfileCard'
import settings from '../features/profile/settings.module.css'
import { useAccountForm } from '../features/profile/useAccountForm'
import { RouteViewDesktop } from '../features/route/RouteView'
import { StopDetail } from '../features/route/StopDetail'
import { useRouteScreen } from '../features/route/useRouteScreen'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { useData, usePreferences, useSession, useToast } from '../state/AppState'
import type { PanelKind } from './desktopPaths'
import styles from './DesktopPanels.module.css'

export function DesktopPanel({ panel }: { panel: PanelKind }) {
  if (panel.kind === 'route') return <RoutePanel id={panel.id} stop={panel.stop} />
  if (panel.kind === 'saved') return <SavedPanel id={panel.id} />
  return <SettingsPanel tab={panel.tab} />
}

/** Ruta next to the chat: linked map and list, reorder when the data module allows it, stop detail as a slide-over. */
function RoutePanel({ id, stop }: { id: string; stop?: number }) {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const screen = useRouteScreen(id)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const { state, route } = screen
  if (state.status === 'missing') return <p className={styles.missing}>{t('route.notFound')}</p>
  if (!route) return null
  return (
    <RouteViewDesktop
      route={route}
      places={screen.places}
      preferences={preferences}
      busy={screen.busy}
      onQuick={(value) => void screen.refine({ type: 'quick', value })}
      onUndo={() => void screen.undo()}
      onSave={() => void screen.save(route)}
      onShare={() => void screen.share(route)}
      highlighted={stop ?? highlighted}
      onHighlight={setHighlighted}
      onSelectStop={(order) => navigate(`/route/${id}/stop/${order}`)}
      onMove={screen.canMove ? (order, to) => void screen.refine({ type: 'move_stop', order, to }) : undefined}
      overlay={
        stop !== undefined && (
          <SlideOver key={stop} label={t('desktop.stopDetailLabel')} onClose={() => navigate(`/route/${id}`)}>
            <StopDetail
              route={route}
              order={stop}
              layout="desktop"
              onRouteChange={screen.setRoute}
              onRemoved={() => navigate(`/route/${id}`)}
              onChangeStop={() => navigate(`/route/${id}/stop/${stop}/alternatives`)}
            />
          </SlideOver>
        )
      }
    />
  )
}

/** Ruta guardada next to the chat (DeskMisRutas.html). */
function SavedPanel({ id }: { id: string }) {
  const screen = useSavedRouteScreen(id)
  if (screen.missing) return <p className={styles.missing}>{t('savedRoute.notFound')}</p>
  if (!screen.route) return null
  return <SavedRouteViewDesktop route={screen.route} screen={screen} />
}

const TABS = [
  { tab: 'personal', to: '/profile', label: () => t('desktop.tabPersonal') },
  { tab: 'preferences', to: '/preferences', label: () => t('desktop.tabPreferences') },
  { tab: 'account', to: '/account', label: () => t('desktop.tabAccount') },
] as const

/** Perfil as settings with three tabs; the tab is the URL (DeskAjustes.html). */
function SettingsPanel({ tab }: { tab: 'personal' | 'preferences' | 'account' }) {
  const { session, isAccount } = useSession()
  return (
    <div className={styles.settingsScroll}>
      <div className={styles.settings}>
        <h1 className={styles.settingsTitle}>{t('profile.title')}</h1>
        <nav aria-label={t('desktop.tabsLabel')} className={styles.tabs}>
          {TABS.map((x) => (
            <NavLink key={x.tab} to={x.to} className={cx(styles.tab, tab === x.tab && styles.tabActive)} aria-current={tab === x.tab ? 'page' : undefined}>
              {x.label()}
            </NavLink>
          ))}
        </nav>
        {tab === 'preferences' ? (
          <PreferencesForm key="prefs" layout="desktop" onSaved={() => undefined} />
        ) : !isAccount ? (
          <ProfileCard />
        ) : tab === 'personal' ? (
          <PersonalTab key={`p-${session.email}`} />
        ) : (
          <AccountTab key={`a-${session.email}`} />
        )}
      </div>
    </div>
  )
}

function PersonalTab() {
  const form = useAccountForm(() => undefined)
  const data = useData()
  const toast = useToast()
  const { refreshSession } = useSession()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await data.logout()
      await refreshSession()
      setConfirming(false)
      toast.show(t('toast.loggedOut'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void form.save()
      }}
    >
      <PersonalFields form={form} />
      <div className={settings.buttons}>
        <Button type="submit" className={settings.medium} disabled={form.busy}>
          {t('account.save')}
        </Button>
        <Button variant="secondary" className={settings.medium} onClick={() => setConfirming(true)}>
          {t('profile.logout')}
        </Button>
      </div>
      <ConfirmSheet
        open={confirming}
        busy={busy}
        title={t('confirm.logoutTitle')}
        text={t('confirm.logoutText')}
        confirmLabel={t('confirm.logoutConfirm')}
        onConfirm={() => void logout()}
        onCancel={() => setConfirming(false)}
      />
    </form>
  )
}

function AccountTab() {
  const form = useAccountForm(() => undefined)
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void form.save()
      }}
    >
      <AccountSettingsFields form={form} />
      <div className={settings.buttons}>
        <Button type="submit" className={settings.medium} disabled={form.busy}>
          {t('account.save')}
        </Button>
      </div>
    </form>
  )
}
