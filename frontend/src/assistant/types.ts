import type { AssistantReply, Preferences, Route } from '../contract/types'

/**
 * Optional presentation hints the mock assistant adds on top of the contract's
 * AssistantReply. The UI must still render a plain AssistantReply (text,
 * options, request, changes) when `display` is absent, e.g. with a real API.
 */
export type ReplyDisplay = {
  /** Paragraphs shown in a separate bubble before this one (onboarding intro). */
  intro?: string[]
  /** Paragraphs before the question (e.g. "Apuntado."). */
  lead?: string[]
  /** "Pregunta N de 4". */
  step?: { index: number; total: number }
  /** Question heading (17/600). */
  prompt?: string
  /** Muted hint below the options. */
  hint?: string
  /** Line after the change bullets ("La ruta termina ahora a las 15:10."). */
  footer?: string
  /** Options form with a "Listo" button (multi-select onboarding steps). */
  form?: boolean
  /** Onboarding finished and preferences were saved. */
  complete?: boolean
  /** Change reply: the route id the "Ver ruta actualizada" button opens. */
  routeId?: string
}

export type RichReply = AssistantReply & { display?: ReplyDisplay }

export type AssistantMode = 'onboarding' | 'request' | 'change'

export type AssistantDeps = {
  getPreferences: () => Promise<Preferences | null>
  savePreferences?: (p: Preferences) => Promise<void>
  getRoute?: (id: string) => Promise<Route>
  refineRoute?: (id: string, action: { type: 'quick'; value: 'menos_caminar' | 'mas_comida' | 'mas_barato' | 'anadir_pausa' }) => Promise<Route>
  undo?: (id: string) => Promise<Route>
  now?: () => Date
  /** Simulated thinking time; tests inject an instant one. */
  delay?: (ms: number) => Promise<void>
  random?: () => number
}
