/* Preferencias de viaje (Preferencias.html): edit the saved preferences; the chat reflects them. */
import { useState } from 'react'
import { Button, Header, OptionChip, Screen, SegmentedControl } from '../components'
import { budgetLabel, companyLabel, interestLabel, paceLabel } from '../assistant/format'
import type { Preferences } from '../contract/types'
import { BUDGET_VALUES, COMPANY_VALUES, DEFAULT_PREFERENCES, INTEREST_VALUES, PACE_VALUES, TRANSPORT_VALUES } from '../data/defaults'
import { t, tDynamic } from '../i18n'
import { useBack } from '../lib/useBack'
import { usePreferences, useToast } from '../state/AppState'
import layout from './layout.module.css'

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value)
}

export function PreferencesPage() {
  const { preferences, savePreferences } = usePreferences()
  const toast = useToast()
  const back = useBack('/profile')
  const [draft, setDraft] = useState<Preferences>(() => ({ ...DEFAULT_PREFERENCES, ...(preferences ?? {}) }))
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Preferences>) => setDraft((d) => ({ ...d, ...patch }))

  async function save() {
    setBusy(true)
    try {
      await savePreferences(draft)
      toast.show(t('toast.preferencesSaved'))
      back()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={`${layout.body} ${layout.gap12}`}>
        <Header onBack={back} label={t('preferences.header')} className={layout.header} />

        <h2 id="pref-interests" className={layout.sectionTitle}>
          {t('preferences.interests')}
        </h2>
        <div className={layout.chips} role="group" aria-labelledby="pref-interests">
          {INTEREST_VALUES.map((v) => (
            <OptionChip key={v} selected={draft.interests.includes(v)} onToggle={(on) => set({ interests: toggle(draft.interests, v, on) })}>
              {interestLabel(v)}
            </OptionChip>
          ))}
        </div>

        <h2 className={layout.sectionTitle}>{t('preferences.pace')}</h2>
        <SegmentedControl
          label={t('preferences.pace')}
          value={draft.pace}
          onChange={(pace) => set({ pace })}
          options={PACE_VALUES.map((v) => ({ value: v, label: paceLabel(v) }))}
        />

        <h2 id="pref-transport" className={layout.sectionTitle}>
          {t('preferences.transport')}
        </h2>
        <div className={layout.chips} role="group" aria-labelledby="pref-transport">
          {TRANSPORT_VALUES.map((v) => (
            <OptionChip key={v} selected={draft.transport.includes(v)} onToggle={(on) => set({ transport: toggle(draft.transport, v, on) })}>
              {tDynamic(`preferences.transportLabel.${v}`)}
            </OptionChip>
          ))}
        </div>

        <h2 id="pref-company" className={layout.sectionTitle}>
          {t('preferences.company')}
        </h2>
        <div className={layout.chips} role="group" aria-labelledby="pref-company">
          {COMPANY_VALUES.map((v) => (
            <OptionChip key={v} selected={draft.company === v} onToggle={() => set({ company: v })}>
              {companyLabel(v)}
            </OptionChip>
          ))}
        </div>

        <h2 className={layout.sectionTitle}>{t('preferences.budget')}</h2>
        <SegmentedControl
          label={t('preferences.budget')}
          value={draft.budget}
          onChange={(budget) => set({ budget })}
          options={BUDGET_VALUES.map((v) => ({ value: v, label: budgetLabel(v) }))}
        />
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={busy} onClick={() => void save()}>
          {t('preferences.save')}
        </Button>
      </div>
    </Screen>
  )
}
