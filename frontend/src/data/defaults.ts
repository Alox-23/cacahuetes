import type { AccountSettings, Preferences } from '../contract/types'

/** Saved by "Omitir" in onboarding (tech spec §7.1). */
export const DEFAULT_PREFERENCES: Preferences = {
  interests: ['arquitectura', 'gastronomia'],
  pace: 'equilibrado',
  transport: ['a_pie', 'transporte_publico'],
  company: 'solo',
  budget: 'medio',
  needs: [],
}

export const INTEREST_VALUES = [
  'arquitectura',
  'gastronomia',
  'museos',
  'naturaleza',
  'historia',
  'compras',
  'vida_nocturna',
  'arte_urbano',
] as const

export const PACE_VALUES: Preferences['pace'][] = ['relajado', 'equilibrado', 'intenso']
export const TRANSPORT_VALUES: Preferences['transport'] = ['a_pie', 'transporte_publico', 'coche', 'bici']
export const COMPANY_VALUES: Preferences['company'][] = ['solo', 'pareja', 'con_ninos', 'grupo']
export const BUDGET_VALUES: Preferences['budget'][] = ['bajo', 'medio', 'alto']

/** Reminder settings of a new account (tech spec feature 2 §5). */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = { remindDayBefore: true, remindToRate: true }
