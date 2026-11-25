import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'
import { createHttpDataModule } from './data/httpData'
import { createAssistant } from './assistant/mockAssistant'
import type { AssistantDeps } from './assistant/types'

const endpoint = import.meta.env.VITE_CACAHUETE_API_URL || (import.meta.env.PROD ? '/api/cacahuete' : undefined)
const data = endpoint ? createHttpDataModule(endpoint) : undefined
const assistantFactory = data
  ? (deps: AssistantDeps) => createAssistant({
      ...deps,
      interpretRequest: data.interpretRequest,
      routeQuestion: data.routeQuestion,
      refineConversation: data.refineConversation,
      delay: () => Promise.resolve(),
    })
  : undefined

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
