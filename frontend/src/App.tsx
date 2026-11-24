import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'

/** App frame (centered mobile column) + state + routes. Router is provided by the caller. */
export function App() {
  return (
    <AppStateProvider>
      <div className="app-frame">
        <AppRoutes />
      </div>
    </AppStateProvider>
  )
}
