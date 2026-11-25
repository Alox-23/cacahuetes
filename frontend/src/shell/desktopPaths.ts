/* Desktop arrangement of the shared URL space (feature 3 §5). Pure functions, unit-testable. */
import { matchPath } from 'react-router-dom'

export type DialogKind = 'save' | 'alternatives' | 'register' | 'login' | 'rate' | 'verifyPending' | 'verifyEmail' | 'authCallback'

export type DesktopContext = {
  hasPreferences: boolean
  isAccount: boolean
  /** Live request transcript is empty and nothing is pending. */
  requestEmpty: boolean
  creating: boolean
}

const KNOWN = [
  '/',
  '/onboarding',
  '/chat',
  '/chat/conversation',
  '/creating',
  '/route/:id',
  '/route/:id/change',
  '/route/:id/stop/:order',
  '/route/:id/stop/:order/alternatives',
  '/route/:id/save',
  '/register',
  '/login',
  '/my-routes',
  '/my-routes/:id',
  '/my-routes/:id/rate',
  '/profile',
  '/preferences',
  '/account',
  // Feature 4 (account security)
  '/verify-pending',
  '/verify-email',
  '/auth/callback',
]

const m = (pattern: string, pathname: string) => matchPath(pattern, pathname)

/** Guards and redirects of the desktop tree (the mobile ones, plus /route/:id/change → /route/:id). */
export function desktopRedirect(pathname: string, ctx: DesktopContext): { to: string; state?: unknown } | null {
  if (!KNOWN.some((p) => m(p, pathname))) return { to: '/' }
  if (pathname === '/onboarding' && ctx.hasPreferences) return { to: '/chat' }
  if ((pathname === '/chat' || pathname === '/chat/conversation') && !ctx.hasPreferences) return { to: '/onboarding' }
  if (pathname === '/chat/conversation' && ctx.requestEmpty) return { to: '/chat' }
  if (pathname === '/creating' && !ctx.creating) return { to: '/chat' }
  const change = m('/route/:id/change', pathname)
  if (change) return { to: `/route/${change.params.id}` }
  // Register, login and guest save redirect accounts on arrival only (the dialog checks it at mount, as dev's
  // GuestOnArrival does), so the navigation that follows signing in is not overtaken here.
  // Confirma tu correo is for accounts (dev's RequireAccount, fallback /login).
  if (pathname === '/verify-pending' && !ctx.isAccount) return { to: '/login' }
  if (pathname === '/account' && !ctx.isAccount) return { to: '/login', state: { background: '/profile', returnTo: '/account' } }
  // Saved route detail and rating are for accounts (dev's RequireAccount).
  if (m('/my-routes/:id/*', pathname) && !ctx.isAccount) return { to: '/my-routes' }
  return null
}

export function dialogFor(pathname: string): DialogKind | null {
  if (m('/route/:id/save', pathname)) return 'save'
  if (m('/route/:id/stop/:order/alternatives', pathname)) return 'alternatives'
  if (pathname === '/register') return 'register'
  if (pathname === '/login') return 'login'
  if (m('/my-routes/:id/rate', pathname)) return 'rate'
  if (pathname === '/verify-pending') return 'verifyPending'
  if (pathname === '/verify-email') return 'verifyEmail'
  if (pathname === '/auth/callback') return 'authCallback'
  return null
}

/** The view kept behind a dialog: its natural parent, or the opener for /register and /login. */
export function backgroundFor(pathname: string, stateBackground: string | undefined, hasPreferences: boolean): string {
  const kind = dialogFor(pathname)
  if (!kind) return pathname
  // Account dialogs (and the feature 4 steps that follow them) stay over the view that opened them;
  // a direct load (an email link, the provider redirect) falls back to the chat, or Inicio before onboarding.
  if (kind === 'register' || kind === 'login' || kind === 'verifyPending' || kind === 'verifyEmail' || kind === 'authCallback') {
    const bg = stateBackground && !dialogFor(stateBackground) ? stateBackground : undefined
    return bg ?? (hasPreferences ? '/chat' : '/')
  }
  if (kind === 'rate') return `/my-routes/${m('/my-routes/:id/rate', pathname)?.params.id}`
  // Alternatives keep the stop detail (slide-over) behind them: Esc goes back to it, with focus on "Cambiar".
  const alternatives = m('/route/:id/stop/:order/alternatives', pathname)
  if (alternatives) return `/route/${alternatives.params.id}/stop/${alternatives.params.order}`
  return `/route/${m('/route/:id/*', pathname)?.params.id}`
}

export type PanelKind =
  | { kind: 'route'; id: string; stop?: number }
  | { kind: 'saved'; id: string }
  | { kind: 'settings'; tab: 'personal' | 'preferences' | 'account' }

/** What the right panel shows for a (background) path; null = chat at full width. */
export function panelFor(pathname: string): PanelKind | null {
  const stop = m('/route/:id/stop/:order', pathname)
  if (stop) return { kind: 'route', id: stop.params.id as string, stop: Number(stop.params.order) }
  const route = m('/route/:id', pathname)
  if (route) return { kind: 'route', id: route.params.id as string }
  const saved = m('/my-routes/:id', pathname)
  if (saved) return { kind: 'saved', id: saved.params.id as string }
  if (pathname === '/profile') return { kind: 'settings', tab: 'personal' }
  if (pathname === '/preferences') return { kind: 'settings', tab: 'preferences' }
  if (pathname === '/account') return { kind: 'settings', tab: 'account' }
  return null
}

/** Route shown in the panel (the chat works on it in change mode). */
export function panelRouteId(panel: PanelKind | null): string | null {
  return panel && (panel.kind === 'route' || panel.kind === 'saved') ? panel.id : null
}
