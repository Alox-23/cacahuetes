import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'
import { createHttpDataModule } from './data/httpData'
import { createAgentAssistant } from './assistant/agentAssistant'
import { createAssistant } from './assistant/mockAssistant'
import type { AssistantDeps, AssistantMode } from './assistant/types'

const endpoint = import.meta.env.VITE_CACAHUETE_API_URL || (import.meta.env.PROD ? '/api/cacahuete' : undefined)
const data = endpoint ? createHttpDataModule(endpoint) : undefined
/**
 * API mode (feature 5 §5.3): the conversational agent for request and change, the scripted
 * onboarding. Without API the provider's default (the scripted assistant for every mode) runs.
 */
const assistantFactory = data
  ? (deps: AssistantDeps, mode: AssistantMode) =>
      mode === 'onboarding'
        ? createAssistant({ ...deps, delay: () => Promise.resolve() })
        : createAgentAssistant({ ...deps, agent: data.agent })
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
