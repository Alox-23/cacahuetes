import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ChangeChatPage } from './pages/ChangeChatPage'
import { ChatPage } from './pages/ChatPage'
import { ConversationPage } from './pages/ConversationPage'
import { CreatingPage } from './pages/CreatingPage'
import { MainPage } from './pages/MainPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { RoutePage } from './pages/RoutePage'
import { LoginPage } from './pages/stubs/LoginPage'
import { MyRoutesPage } from './pages/stubs/MyRoutesPage'
import { PreferencesPage } from './pages/stubs/PreferencesPage'
import { ProfilePage } from './pages/stubs/ProfilePage'
import { usePreferences } from './state/AppState'

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

/** URL map (tech spec §2). */
export function AppRoutes() {
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
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/my-routes" element={<MyRoutesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
