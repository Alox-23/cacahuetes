import type { ReactNode } from 'react'
import { AssistantBubble, Button, QuickReply } from '../../components'
import type { RichReply } from '../../assistant/types'
import { t } from '../../i18n'
import styles from './chat.module.css'

type Option = NonNullable<RichReply['options']>[number]

type ReplyViewProps = {
  reply: RichReply
  /** Only the latest reply has live controls. */
  interactive: boolean
  /** Option value the user picked for this reply (answered questions in the history). */
  chosen?: string
  onOption?: (option: Option) => void
  /** Replaces the default quick replies (onboarding forms). */
  renderOptions?: (reply: RichReply, interactive: boolean, chosen?: string) => ReactNode
  /** Rendered for kind "summary". */
  renderSummary?: (reply: RichReply, interactive: boolean) => ReactNode
  onUndo?: () => void
  /** Target of "Ver ruta actualizada" in change replies. */
  routeHref?: string
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <>
      {items.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </>
  )
}

type OptionsProps = { options: Option[]; interactive: boolean; chosen?: string; onOption?: (option: Option) => void }

/** Quick replies; answered questions stay visible with their options disabled (spec 4). */
function Options({ options, interactive, chosen, onOption }: OptionsProps) {
  return (
    <div className={styles.options}>
      {options.map((o) => (
        <QuickReply
          key={o.value}
          label={o.label}
          disabled={!interactive}
          selected={interactive ? undefined : chosen === o.value}
          onClick={() => onOption?.(o)}
        />
      ))}
    </div>
  )
}

/**
 * Renders any assistant reply. Uses the mock's optional `display` hints when
 * present and falls back to the plain contract fields (text, options, changes).
 */
export function ReplyView({ reply, interactive, chosen, onOption, renderOptions, renderSummary, onUndo, routeHref }: ReplyViewProps) {
  const d = reply.display ?? {}
  const intro = d.intro && d.intro.length > 0 ? (
    <AssistantBubble>
      <Paragraphs items={d.intro} />
    </AssistantBubble>
  ) : null

  if (reply.kind === 'summary' && reply.request && renderSummary) {
    return (
      <AssistantBubble>
        {d.lead && <Paragraphs items={d.lead} />}
        {renderSummary(reply, interactive)}
      </AssistantBubble>
    )
  }

  const options = reply.options ?? []
  const changeOptions = reply.kind === 'change' ? options : []
  if (reply.kind === 'change') {
    return (
      <AssistantBubble>
        <span>{reply.text}</span>
        {reply.changes && reply.changes.length > 0 && (
          <ul className={styles.bullets}>
            {reply.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {d.footer && <span>{d.footer}</span>}
        {routeHref && (
          <Button to={routeHref} fullWidth>
            {t('change.viewUpdated')}
          </Button>
        )}
        {interactive && onUndo && (
          <Button variant="text" className={styles.centered} onClick={onUndo}>
            {t('common.undo')}
          </Button>
        )}
        {/* Feature 5: the agent's suggestions and its "modo sin IA" hint (the script sends neither here). */}
        {changeOptions.length > 0 && <Options options={changeOptions} interactive={interactive} chosen={chosen} onOption={onOption} />}
        {d.hint && <span className={styles.hint}>{d.hint}</span>}
      </AssistantBubble>
    )
  }

  const hasPrompt = Boolean(d.prompt)
  return (
    <>
      {intro}
      <AssistantBubble>
        {d.lead && d.lead.length > 0 && <Paragraphs items={d.lead} />}
        {d.step && (
          <span className={styles.stepLabel}>{t('onboarding.stepLabel', { index: d.step.index, total: d.step.total })}</span>
        )}
        {hasPrompt ? <span className={styles.prompt}>{d.prompt}</span> : <Paragraphs items={reply.text.split('\n')} />}
        {options.length > 0 &&
          (renderOptions ? (
            renderOptions(reply, interactive, chosen)
          ) : (
            <Options options={options} interactive={interactive} chosen={chosen} onOption={onOption} />
          ))}
        {d.hint && <span className={styles.hint}>{d.hint}</span>}
      </AssistantBubble>
    </>
  )
}
