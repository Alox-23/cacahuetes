import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'
import { createHttpDataModule } from './data/httpData'
import { apiAssistantFactory } from './assistant/factory'

const endpoint = import.meta.env.VITE_CACAHUETE_API_URL || (import.meta.env.PROD ? '/api/cacahuete' : undefined)
const data = endpoint ? createHttpDataModule(endpoint) : undefined
/** API mode: the agent for request/change, the script for onboarding (assistant/factory.ts). */
const assistantFactory = data ? apiAssistantFactory(data.agent) : undefined

/** App frame (centered mobile column) + state + routes. Router is provided by the caller. */
export function App() {
  return (
    <AppStateProvider data={data} assistantFactory={assistantFactory}>
      <div className="app-frame">
        <AppRoutes />
      </div>
    </AppStateProvider>
  )
}
