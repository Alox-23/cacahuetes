import { CheckIcon, PendingIcon, SpinnerIcon } from '../../components'
import { t } from '../../i18n'
import { cx } from '../../lib/cx'
import styles from './CreationSteps.module.css'

const STEPS = ['creating.step1', 'creating.step2', 'creating.step3', 'creating.step4'] as const

/** The four creation steps with done / active / pending icons (Cargando.html, DeskAsistenteCreando.html). */
export function CreationSteps({ step, compact = false }: { step: number; compact?: boolean }) {
  return (
    <ol className={cx(styles.steps, compact && styles.compact)} aria-live="polite">
      {STEPS.map((key, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'pending'
        return (
          <li key={key} className={cx(styles.step, state === 'active' && styles.stepActive)}>
            {state === 'done' && <CheckIcon className={styles.iconDone} />}
            {state === 'active' && <SpinnerIcon className={styles.iconActive} />}
            {state === 'pending' && <PendingIcon className={styles.iconPending} />}
            <span>{t(key)}</span>
            <span className="sr-only">
              {state === 'done' ? t('creating.stateDone') : state === 'active' ? t('creating.stateActive') : t('creating.statePending')}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
