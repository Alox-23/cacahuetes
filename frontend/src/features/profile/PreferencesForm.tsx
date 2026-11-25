/* Preferencias de viaje content (Preferencias.html / DeskAjustes.html): dev's fields and save. */
import { useState, type ReactNode } from 'react'
import { Button, OptionChip, SegmentedControl } from '../../components'
import { budgetLabel, companyLabel, interestLabel, paceLabel, transportLabel } from '../../assistant/format'
import type { Preferences } from '../../contract/types'
import { BUDGET_VALUES, COMPANY_VALUES, DEFAULT_PREFERENCES, INTEREST_VALUES, PACE_VALUES, TRANSPORT_VALUES } from '../../data/defaults'
import { t, tDynamic } from '../../i18n'
import { usePreferences, useToast } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import styles from './settings.module.css'

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value)
}

type PreferencesFormProps = {
  layout?: 'mobile' | 'desktop'
  /** After the preferences were saved. */
  onSaved: () => void
  /** Mobile: header at the top of the body. */
  top?: ReactNode
}

export function PreferencesForm({ layout: where = 'mobile', onSaved, top }: PreferencesFormProps) {
  const { preferences, savePreferences } = usePreferences()
  const toast = useToast()
  const initial = () => ({ ...DEFAULT_PREFERENCES, ...(preferences ?? {}) })
  const [draft, setDraft] = useState<Preferences>(initial)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Preferences>) => setDraft((d) => ({ ...d, ...patch }))
  const desktop = where === 'desktop'

  async function save() {
    setBusy(true)
    try {
      await savePreferences(draft)
      toast.show(t('toast.preferencesSaved'))
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const fields = (
    <>
      {desktop && <p className={layout.subtitle}>{t('desktop.prefsIntro')}</p>}
      <h2 id={`pref-interests-${where}`} className={layout.sectionTitle}>
        {t('preferences.interests')}
      </h2>
      <div className={layout.chips} role="group" aria-labelledby={`pref-interests-${where}`}>
        {INTEREST_VALUES.map((v) => (
          <OptionChip key={v} selected={draft.interests.includes(v)} onToggle={(on) => set({ interests: toggle(draft.interests, v, on) })}>
            {interestLabel(v)}
          </OptionChip>
        ))}
      </div>

      <h2 className={layout.sectionTitle}>{t('preferences.pace')}</h2>
      <SegmentedControl
        label={t('preferences.pace')}
        className={desktop ? styles.segmented : undefined}
        value={draft.pace}
        onChange={(pace) => set({ pace })}
        options={PACE_VALUES.map((v) => ({ value: v, label: paceLabel(v) }))}
      />

      <h2 id={`pref-transport-${where}`} className={layout.sectionTitle}>
        {t('preferences.transport')}
      </h2>
      <div className={layout.chips} role="group" aria-labelledby={`pref-transport-${where}`}>
        {TRANSPORT_VALUES.map((v) => (
          <OptionChip key={v} selected={draft.transport.includes(v)} onToggle={(on) => set({ transport: toggle(draft.transport, v, on) })}>
            {/* The desktop design spells "Transporte público" out; the mobile one says "Público". */}
            {desktop ? transportLabel(v) : tDynamic(`preferences.transportLabel.${v}`)}
          </OptionChip>
        ))}
      </div>

      <h2 id={`pref-company-${where}`} className={layout.sectionTitle}>
        {t('preferences.company')}
      </h2>
      <div className={layout.chips} role="group" aria-labelledby={`pref-company-${where}`}>
        {COMPANY_VALUES.map((v) => (
          <OptionChip key={v} selected={draft.company === v} onToggle={() => set({ company: v })}>
            {companyLabel(v)}
          </OptionChip>
        ))}
      </div>

      <h2 className={layout.sectionTitle}>{t('preferences.budget')}</h2>
      <SegmentedControl
        label={t('preferences.budget')}
        className={desktop ? styles.segmented : undefined}
        value={draft.budget}
        onChange={(budget) => set({ budget })}
        options={BUDGET_VALUES.map((v) => ({ value: v, label: budgetLabel(v) }))}
      />
    </>
  )

  if (desktop) {
    return (
      <div className={styles.desktopForm}>
        {fields}
        <div className={styles.buttons}>
          <Button className={styles.medium} disabled={busy} onClick={() => void save()}>
            {t('preferences.save')}
          </Button>
          <Button variant="secondary" className={styles.medium} onClick={() => setDraft(initial())}>
            {t('desktop.discard')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <>
      <div className={`${layout.body} ${layout.gap12}`}>
        {top}
        {fields}
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={busy} onClick={() => void save()}>
          {t('preferences.save')}
        </Button>
      </div>
    </>
  )
}
