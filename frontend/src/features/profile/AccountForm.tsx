/* Cuenta content (Cuenta.html): dev's AccountPage state, checks and actions, split into the two desktop tabs. */
import { Card, Checkbox, ConfirmSheet, ListRow, TextField } from '../../components'
import { t } from '../../i18n'
import { useToast } from '../../state/AppState'
import layout from '../../pages/layout.module.css'
import type { AccountFormState } from './useAccountForm'

/** Nombre and Correo ("Datos personales" on desktop). */
export function PersonalFields({ form }: { form: AccountFormState }) {
  return (
    <>
      <TextField label={t('account.name')} autoComplete="name" placeholder={t('account.namePlaceholder')} value={form.name} onChange={(e) => form.setName(e.target.value)} error={form.errors.name} />
      <TextField
        label={t('account.email')}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={t('account.emailPlaceholder')}
        value={form.email}
        onChange={(e) => form.setEmail(e.target.value)}
        error={form.errors.email}
      />
    </>
  )
}

/** Password, language, reminders and "Eliminar cuenta" ("Cuenta" on desktop). */
export function AccountSettingsFields({ form }: { form: AccountFormState }) {
  const toast = useToast()
  const pending = () => toast.show(t('toast.pending'))
  return (
    <>
      <Card className={layout.listCard}>
        <ListRow label={t('account.changePassword')} onClick={pending} />
        <ListRow label={t('account.language')} value={t('account.languageValue')} onClick={pending} last />
      </Card>
      <fieldset className={layout.fieldset}>
        <legend className="sr-only">{t('account.notificationsLabel')}</legend>
        <Checkbox
          label={t('account.remindDayBefore')}
          checked={form.settings.remindDayBefore}
          onChange={(e) => form.setSettings((s) => ({ ...s, remindDayBefore: e.target.checked }))}
        />
        <Checkbox label={t('account.remindToRate')} checked={form.settings.remindToRate} onChange={(e) => form.setSettings((s) => ({ ...s, remindToRate: e.target.checked }))} />
      </fieldset>
      <button type="button" className={`${layout.textAction} ${layout.start} ${layout.danger}`} onClick={() => form.setConfirming(true)}>
        {t('account.delete')}
      </button>
      <ConfirmSheet
        open={form.confirming}
        busy={form.busy}
        title={t('confirm.deleteAccountTitle')}
        text={t('confirm.deleteAccountText')}
        confirmLabel={t('confirm.deleteAccountConfirm')}
        onConfirm={() => void form.deleteAccount()}
        onCancel={() => form.setConfirming(false)}
      />
    </>
  )
}
