import { Navigate, useLocation } from 'react-router-dom'
import type { AuthState } from '../features/account/AuthForm'
import { modeView } from '../state/thread'
import { useAppState } from '../state/AppState'
import { DesktopMain } from './DesktopMain'
import { DesktopDialog } from './DesktopDialogs'
import { DesktopShell } from './DesktopShell'
import { backgroundFor, desktopRedirect, dialogFor } from './desktopPaths'

/** Desktop route tree: Inicio on its own, everything else inside the three-zone shell. */
export function DesktopRoutes() {
  const location = useLocation()
  const { preferences, session, thread, epochs, pending, creation } = useAppState()
  const { pathname } = location
  const redirect = desktopRedirect(pathname, {
    hasPreferences: preferences !== null,
    isAccount: session.kind === 'account',
    requestEmpty: modeView(thread, 'request', epochs.request).length === 0 && !pending.request,
    creating: creation !== null,
  })
  if (redirect) return <Navigate to={redirect.to} replace state={redirect.state} />

  const kind = dialogFor(pathname)
  const background = backgroundFor(pathname, (location.state as AuthState)?.background, preferences !== null)
  const dialog = kind ? <DesktopDialog kind={kind} background={background} /> : null

  if (background === '/') {
    return (
      <>
        <DesktopMain />
        {dialog}
      </>
    )
  }
  return <DesktopShell contextPath={background} dialog={dialog} />
}
