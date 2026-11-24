import { useState } from 'react'
import { Button, OptionChip, QuickReply, SegmentedControl } from '../../components'
import type { RichReply } from '../../assistant/types'
import { t } from '../../i18n'
import styles from './chat.module.css'

type Option = NonNullable<RichReply['options']>[number]

type OnboardingFormProps = {
  reply: RichReply
  /** Selected option values ("field:value"). */
  onSubmit: (values: string[]) => void
  onQuick: (option: Option) => void
}

const fieldOf = (value: string) => value.split(':')[0]

/**
 * Options inside an onboarding question:
 *  - single-choice steps → quick replies (tap advances)
 *  - form steps → multi-select chips (aria-pressed), single groups as a radio
 *    segmented control, and "Listo".
 */
export function OnboardingForm({ reply, onSubmit, onQuick }: OnboardingFormProps) {
  const options = reply.options ?? []
  const fields = [...new Set(options.map((o) => fieldOf(o.value)))]
  const groups = fields.map((field) => {
    const items = options.filter((o) => fieldOf(o.value) === field)
    return { field, items, multiple: items.some((o) => o.multiple) }
  })

  const [single, setSingle] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const g of groups) {
      if (!g.multiple) initial[g.field] = (g.items.find((o) => o.value.endsWith(':equilibrado')) ?? g.items[0]).value
    }
    return initial
  })
  const [multi, setMulti] = useState<string[]>([])

  if (!reply.display?.form) {
    return (
      <div className={styles.options}>
        {options.map((o) => (
          <QuickReply key={o.value} label={o.label} onClick={() => onQuick(o)} />
        ))}
      </div>
    )
  }

  const ready = groups.every((g) => !g.multiple || multi.some((v) => fieldOf(v) === g.field))

  function toggle(value: string, selected: boolean) {
    setMulti((prev) => (selected ? [...prev, value] : prev.filter((v) => v !== value)))
  }

  return (
    <>
      {groups.map((g) =>
        g.multiple ? (
          <div key={g.field} role="group" aria-label={groupLabel(g.field)} className={styles.options}>
            {g.items.map((o) => (
              <OptionChip key={o.value} selected={multi.includes(o.value)} onToggle={(sel) => toggle(o.value, sel)}>
                {o.label}
              </OptionChip>
            ))}
          </div>
        ) : (
          <SegmentedControl
            key={g.field}
            label={groupLabel(g.field)}
            options={g.items.map((o) => ({ label: o.label, value: o.value }))}
            value={single[g.field]}
            onChange={(v) => setSingle((prev) => ({ ...prev, [g.field]: v }))}
          />
        ),
      )}
      <Button fullWidth disabled={!ready} onClick={() => onSubmit([...Object.values(single), ...orderLike(options, multi)])}>
        {t('common.done')}
      </Button>
    </>
  )
}

function groupLabel(field: string): string {
  if (field === 'pace') return t('onboarding.q2Pace')
  if (field === 'transport') return t('onboarding.q2Transport')
  return t('onboarding.q1')
}

/** Keep selections in the order the options are listed. */
function orderLike(options: Option[], selected: string[]): string[] {
  return options.map((o) => o.value).filter((v) => selected.includes(v))
}
