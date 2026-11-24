/* Scripted content of the simulated assistant: onboarding questions, slot questions, quick replies. */
import type { AssistantReply } from '../contract/types'
import { BUDGET_VALUES, COMPANY_VALUES, INTEREST_VALUES, PACE_VALUES, TRANSPORT_VALUES } from '../data/defaults'
import { t, tDynamic, type TranslationKey } from '../i18n'
import { QUICK_REFINES } from '../lib/refineKeywords'
import { budgetLabel, companyLabel, interestLabel, paceLabel, transportLabel } from './format'
import type { RichReply } from './types'

type Option = NonNullable<AssistantReply['options']>[number]

export const ONBOARDING_TOTAL = 4

/** Option values are namespaced "field:value" so the UI can group them. */
export function onboardingOptions(step: number): Option[] {
  switch (step) {
    case 1:
      return INTEREST_VALUES.map((v) => ({ label: interestLabel(v), value: `interests:${v}`, multiple: true }))
    case 2:
      return [
        ...PACE_VALUES.map((v) => ({ label: paceLabel(v), value: `pace:${v}`, multiple: false })),
        ...TRANSPORT_VALUES.map((v) => ({ label: transportLabel(v), value: `transport:${v}`, multiple: true })),
      ]
    case 3:
      return COMPANY_VALUES.map((v) => ({ label: companyLabel(v), value: `company:${v}` }))
    case 4:
      return BUDGET_VALUES.map((v) => ({ label: budgetLabel(v), value: `budget:${v}` }))
    default:
      return []
  }
}

const PROMPTS: Record<number, TranslationKey> = {
  1: 'onboarding.q1',
  2: 'onboarding.q2',
  3: 'onboarding.q3',
  4: 'onboarding.q4',
}

/** The question bubble for an onboarding step, optionally with lead paragraphs. */
export function onboardingQuestion(step: number, lead: string[] = [], intro?: string[]): RichReply {
  const prompt = t(PROMPTS[step])
  const hint = step === 4 ? t('onboarding.q4Hint') : undefined
  const stepLabel = t('onboarding.stepLabel', { index: step, total: ONBOARDING_TOTAL })
  return {
    kind: 'question',
    text: [...(intro ?? []), ...lead, stepLabel, prompt, ...(hint ? [hint] : [])].join('\n'),
    options: onboardingOptions(step),
    display: {
      intro,
      lead,
      step: { index: step, total: ONBOARDING_TOTAL },
      prompt,
      hint,
      form: step === 1 || step === 2,
    },
  }
}

export function onboardingIntro(): RichReply {
  return onboardingQuestion(1, [], [t('onboarding.intro1'), t('onboarding.intro2')])
}

export function onboardingDone(): RichReply {
  return { kind: 'question', text: t('onboarding.finished'), display: { complete: true } }
}

/* ---------- Request mode ---------- */

export type Slot = 'date' | 'time' | 'start'
export const SLOT_ORDER: Slot[] = ['date', 'time', 'start']

const SLOT_OPTIONS: Record<Slot, { key: TranslationKey; value: string }[]> = {
  date: [
    { key: 'request.opt_date_today', value: 'date:today' },
    { key: 'request.opt_date_tomorrow', value: 'date:tomorrow' },
    { key: 'request.opt_date_saturday', value: 'date:saturday' },
  ],
  time: [
    { key: 'request.opt_time_3h', value: 'time:3h' },
    { key: 'request.opt_time_5h', value: 'time:5h' },
    { key: 'request.opt_time_allday', value: 'time:allday' },
  ],
  start: [
    { key: 'request.opt_start_naranjos', value: 'start:naranjos' },
    { key: 'request.opt_start_alameda', value: 'start:alameda' },
    { key: 'request.opt_start_banus', value: 'start:banus' },
    { key: 'request.opt_start_other', value: 'start:other' },
  ],
}

export function slotOptions(slot: Slot): Option[] {
  return SLOT_OPTIONS[slot].map((o) => ({ label: t(o.key), value: o.value }))
}

export function slotQuestion(slot: Slot): string {
  return tDynamic(`request.q_${slot}`)
}

export function optionLabel(value: string): string | undefined {
  for (const slot of SLOT_ORDER) {
    const found = SLOT_OPTIONS[slot].find((o) => o.value === value)
    if (found) return t(found.key)
  }
  return undefined
}

/* ---------- Change mode ---------- */

export function quickRefineOptions(): Option[] {
  return QUICK_REFINES.map((v) => ({ label: tDynamic(`route.quick.${v}`), value: `quick:${v}` }))
}

export const UNDO_OPTION = 'undo'

