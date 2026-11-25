/* Dialog routes on desktop (feature 3 §5): closing goes back to the view behind. */
import { useState } from 'react'
import { Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../components'
import { formatDateShort } from '../assistant/format'
import { AuthForm, type AuthState } from '../features/account/AuthForm'
import { RateForm } from '../features/myRoutes/RateForm'
import { AlternativesList } from '../features/route/AlternativesList'
import { t } from '../i18n'
import { AuthCallbackPage } from '../pages/AuthCallbackPage'
import { useRoute } from '../pages/routeHooks'
import { VerifyEmailPage } from '../pages/VerifyEmailPage'
import { VerifyPendingPage } from '../pages/VerifyPendingPage'
import { useSession } from '../state/AppState'
import type { DialogKind } from './desktopPaths'

export function DesktopDialog({ kind, background }: { kind: DialogKind; background: string }) {
  const navigate = useNavigate()
  const close = () => navigate(background, { replace: true })
  switch (kind) {
    case 'register':
    case 'login':
      // Keyed by mode: switching login ↔ register remounts the dialog so focus moves into the new one.
      return <AuthDialog key={kind} mode={kind} background={background} onClose={close} />
    case 'save':
      return <SaveDialog background={background} onClose={close} />
    case 'alternatives':
      return <AlternativesDialog />
    case 'rate':
      return <RateDialog background={background} onClose={close} />
    case 'verifyPending':
      return <VerifyPendingPage desktop />
    case 'verifyEmail':
      return <VerifyEmailPage background={background} />
    case 'authCallback':
      return <AuthCallbackPage background={background} />
  }
}

/** As dev's GuestOnArrival: an account arriving here is redirected once, at mount. */
function useWasAccount() {
  const { isAccount } = useSession()
  const [was] = useState(isAccount)
  return was
}

function AuthDialog({ mode, background, onClose }: { mode: 'register' | 'login'; background: string; onClose: () => void }) {
  const navigate = useNavigate()
  const state = (useLocation().state as AuthState) ?? null
  const wasAccount = useWasAccount()
  if (wasAccount) return <Navigate to="/my-routes" replace />
  const register = mode === 'register'
  const saving = Boolean(state?.saveRouteId)
  return (
    <Dialog
      title={register ? (saving ? t('saveGuest.title') : t('auth.registerTitle')) : t('auth.loginTitle')}
      description={register ? (saving ? t('saveGuest.text') : t('auth.registerSubtitle')) : t('auth.loginSubtitle')}
      onClose={onClose}
    >
      <AuthForm
        key={mode}
        mode={mode}
        layout="desktop"
        state={state}
        submitLabel={register && saving ? t('desktop.saveAndCreate') : undefined}
        switchLabel={register && saving ? t('saveGuest.login') : undefined}
        onSwitch={() => navigate(register ? '/login' : '/register', { state: { ...state, background }, replace: true })}
      />
    </Dialog>
  )
}

/** Guardar como invitado + Crear cuenta in one dialog (DeskCrearCuenta.html). */
function SaveDialog({ background, onClose }: { background: string; onClose: () => void }) {
  const navigate = useNavigate()
  const wasAccount = useWasAccount()
  const id = matchPath('/route/:id', background)?.params.id ?? ''
  if (wasAccount) return <Navigate to={`/route/${id}`} replace />
  const state: AuthState = { returnTo: `/my-routes/${id}`, saveRouteId: id, background }
  return (
    <Dialog title={t('saveGuest.title')} description={t('saveGuest.text')} onClose={onClose}>
      <AuthForm
        mode="register"
        layout="desktop"
        state={state}
        submitLabel={t('desktop.saveAndCreate')}
        switchLabel={t('saveGuest.login')}
        onSwitch={() => navigate('/login', { state, replace: true })}
      />
    </Dialog>
  )
}

function AlternativesDialog() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const params = matchPath('/route/:id/stop/:order/alternatives', pathname)?.params
  const id = params?.id ?? ''
  const order = Number(params?.order)
  const { route } = useRoute(id)
  const stop = route?.stops.find((s) => s.order === order)
  return (
    <Dialog title={t('alternatives.title', { name: stop?.name ?? '' })} onClose={() => navigate(`/route/${id}/stop/${order}`, { replace: true })}>
      {route && stop && <AlternativesList route={route} order={order} layout="desktop" onDone={() => navigate(`/route/${id}`, { replace: true })} />}
    </Dialog>
  )
}

function RateDialog({ background, onClose }: { background: string; onClose: () => void }) {
  const id = matchPath('/my-routes/:id', background)?.params.id ?? ''
  const { route } = useRoute(id)
  return (
    <Dialog
      title={t('rate.title')}
      description={route ? t('rate.subtitle', { name: route.name, date: formatDateShort(route.request.date, false) }) : undefined}
      onClose={onClose}
    >
      {route && <RateForm route={route} layout="desktop" onDone={onClose} />}
    </Dialog>
  )
}
