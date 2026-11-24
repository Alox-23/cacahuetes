/* What happens after any sign-in (form, Google/Apple, callback): save the pending route, then navigate. */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '../../contract/types'
import { t } from '../../i18n'
import { useData, useSession, useToast } from '../../state/AppState'

/** Router state passed by "Guardar como invitado" (and kept when switching forms). */
export type AuthState = { returnTo?: string; saveRouteId?: string } | null

/** sessionStorage key that carries the AuthState across the provider redirect. */
export const AUTH_RETURN_KEY = 'rt.auth.return'

/** Only same-origin paths ("/x", never "//host" or "/\host") are followed after signing in. */
export function safeReturnTo(value: unknown): string | undefined {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : undefined
}

function tabStorage(): Storage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/** Keep returnTo/saveRouteId for after the provider redirect. */
export function rememberReturn(state: AuthState) {
  try {
    tabStorage()?.setItem(AUTH_RETURN_KEY, JSON.stringify(state ?? {}))
  } catch {
    // Storage blocked: the user lands on Mis rutas instead.
  }
}

/** Read and clear what rememberReturn stored (validated, never trusted as is). */
export function takeReturn(): AuthState {
  try {
    const storage = tabStorage()
    const raw = storage?.getItem(AUTH_RETURN_KEY)
    storage?.removeItem(AUTH_RETURN_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object') return null
    const { returnTo, saveRouteId } = value as Record<string, unknown>
    return {
      returnTo: safeReturnTo(returnTo),
      saveRouteId: typeof saveRouteId === 'string' ? saveRouteId : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Returns the function to run once signed in: save `state.saveRouteId`, refresh the session and
 * navigate. A new, unconfirmed account goes through Confirma tu correo first.
 */
export function useAfterSignIn() {
  const data = useData()
  const { refreshSession } = useSession()
  const { show } = useToast()
  const navigate = useNavigate()
  return useCallback(
    async (session: Session, state: AuthState, registered: boolean) => {
      if (state?.saveRouteId) {
        try {
          await data.saveRoute(state.saveRouteId)
          show(t('toast.routeSaved'))
        } catch {
          // The route may have been removed meanwhile; the account still works.
        }
      }
      await refreshSession()
      const returnTo = safeReturnTo(state?.returnTo)
      if (registered && session.emailVerified === false) {
        navigate('/verify-pending', { replace: true, state: { returnTo } })
      } else {
        navigate(returnTo ?? '/my-routes', { replace: true })
      }
    },
    [data, refreshSession, show, navigate],
  )
}
