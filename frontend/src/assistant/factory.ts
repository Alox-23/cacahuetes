import type { DataModule } from '../contract/types'
import { createAgentAssistant } from './agentAssistant'
import { createAssistant, type MockAssistant } from './mockAssistant'
import type { AssistantDeps, AssistantMode } from './types'

/**
 * API mode (feature 5 §5.3): the conversational agent for request and change, the scripted onboarding
 * (it keeps its buttons). Without API, App.tsx passes no factory and the scripted assistant runs every mode.
 */
export function apiAssistantFactory(agent: NonNullable<DataModule['agent']>) {
  return (deps: AssistantDeps, mode: AssistantMode): MockAssistant =>
    mode === 'onboarding'
      ? createAssistant({ ...deps, delay: () => Promise.resolve() })
      : createAgentAssistant({ ...deps, agent })
}
