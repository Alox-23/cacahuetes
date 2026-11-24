import { useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AccountPage } from './pages/AccountPage'
import { AlternativesPage } from './pages/AlternativesPage'
import { ChangeChatPage } from './pages/ChangeChatPage'
import { ChatPage } from './pages/ChatPage'
import { ConversationPage } from './pages/ConversationPage'
import { CreatingPage } from './pages/CreatingPage'
import { LoginPage } from './pages/LoginPage'
import { MainPage } from './pages/MainPage'
import { MyRoutesPage } from './pages/MyRoutesPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PreferencesPage } from './pages/PreferencesPage'
import { ProfilePage } from './pages/ProfilePage'
import { RatePage } from './pages/RatePage'
import { RegisterPage } from './pages/RegisterPage'
import { RoutePage } from './pages/RoutePage'
import { SavedRoutePage } from './pages/SavedRoutePage'
import { SaveGuestPage } from './pages/SaveGuestPage'
import { StopPage } from './pages/StopPage'
import { useLayout } from './lib/useLayout'
import { DesktopRoutes } from './shell/DesktopRoutes'
import { usePreferences, useSession } from './state/AppState'

/** /chat… needs onboarding done; otherwise go answer the four questions. */
function RequireOnboarded({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences()
  return preferences ? <>{children}</> : <Navigate to="/onboarding" replace />
}

/** The four questions are asked once: /onboarding redirects when preferences exist. */
function OnlyFirstTime({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences()
  return preferences ? <Navigate to="/chat" replace /> : <>{children}</>
}

/** Screens that need an account (Cuenta, saved route detail, rating). */
function RequireAccount({ children, fallback }: { children: ReactNode; fallback: string }) {
  const { isAccount } = useSession()
  return isAccount ? <>{children}</> : <Navigate to={fallback} replace />
}

/**
 * Redirect accounts away on arrival (login, register, guest save). The check
 * uses the session at mount time so the screen's own navigation after signing
 * in (to `returnTo`) is not overtaken by this redirect.
 */
function GuestOnArrival({ children, to }: { children: ReactNode; to: string }) {
  const { isAccount } = useSession()
  const [wasAccount] = useState(isAccount)
  return wasAccount ? <Navigate to={to} replace /> : <>{children}</>
}

function SaveGuestRoute() {
  const { id = '' } = useParams()
  return (
    <GuestOnArrival to={`/route/${id}`}>
      <SaveGuestPage />
    </GuestOnArrival>
  )
}

/** One URL space, two arrangements (feature 3 §5): the layout picks the route tree. */
export function AppRoutes() {
  const layout = useLayout()
  return layout === 'desktop' ? <DesktopRoutes /> : <MobileRoutes />
}

/** Mobile and tablet screens (URL map of tech specs feature 1 §2 and feature 2 §2). */
function MobileRoutes() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route
        path="/onboarding"
        element={
          <OnlyFirstTime>
            <OnboardingPage />
          </OnlyFirstTime>
        }
      />
      <Route
        path="/chat"
        element={
          <RequireOnboarded>
            <ChatPage />
          </RequireOnboarded>
        }
      />
      <Route
        path="/chat/conversation"
        element={
          <RequireOnboarded>
            <ConversationPage />
          </RequireOnboarded>
        }
      />
      <Route path="/creating" element={<CreatingPage />} />
      <Route path="/route/:id" element={<RoutePage />} />
      <Route path="/route/:id/change" element={<ChangeChatPage />} />
      <Route path="/route/:id/stop/:order" element={<StopPage />} />
      <Route path="/route/:id/stop/:order/alternatives" element={<AlternativesPage />} />
      <Route path="/route/:id/save" element={<SaveGuestRoute />} />
      <Route
        path="/register"
        element={
          <GuestOnArrival to="/my-routes">
            <RegisterPage />
          </GuestOnArrival>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnArrival to="/my-routes">
            <LoginPage />
          </GuestOnArrival>
        }
      />
      <Route path="/my-routes" element={<MyRoutesPage />} />
      <Route
        path="/my-routes/:id"
        element={
          <RequireAccount fallback="/my-routes">
            <SavedRoutePage />
          </RequireAccount>
        }
      />
      <Route
        path="/my-routes/:id/rate"
        element={
          <RequireAccount fallback="/my-routes">
            <RatePage />
          </RequireAccount>
        }
      />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route
        path="/account"
        element={
          <RequireAccount fallback="/login">
            <AccountPage />
          </RequireAccount>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
