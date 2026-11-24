/* Cuenta (Cuenta.html): name, email, password, language, reminders and delete account. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Checkbox, ConfirmSheet, Header, ListRow, Screen, TextField } from '../components'
import type { AccountSettings } from '../contract/types'
import { DEFAULT_ACCOUNT_SETTINGS } from '../data/defaults'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import { isValidEmail } from '../lib/validation'
import { useCurrentRoute, useData, useSession, useToast } from '../state/AppState'
import layout from './layout.module.css'

export function AccountPage() {
  const navigate = useNavigate()
  const data = useData()
  const toast = useToast()
  const { session, refreshSession } = useSession()
  const { setCurrentRouteId } = useCurrentRoute()
  const back = useBack('/profile')
  const [name, setName] = useState(session.name ?? '')
  const [email, setEmail] = useState(session.email ?? '')
  const [settings, setSettings] = useState<AccountSettings>({ ...DEFAULT_ACCOUNT_SETTINGS, ...session.settings })
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = () => toast.show(t('toast.pending'))

  const errors = submitted
    ? { name: name.trim() ? undefined : t('account.errorName'), email: isValidEmail(email) ? undefined : t('auth.errorEmail') }
    : {}

  async function save() {
    setSubmitted(true)
    if (!name.trim() || !isValidEmail(email)) return
    setBusy(true)
    try {
      await data.updateAccount({ name: name.trim(), email: email.trim(), settings })
      await refreshSession()
      toast.show(t('toast.accountSaved'))
      back()
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      await data.deleteAccount()
      setCurrentRouteId(null)
      setConfirming(false)
      // Leave /account first: its guard would send a guest to /login.
      navigate('/', { replace: true })
      await refreshSession()
      toast.show(t('toast.accountDeleted'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header onBack={back} label={t('account.header')} className={layout.header} />
        <div className={layout.spacer} />
        <TextField label={t('account.name')} autoComplete="name" placeholder={t('account.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField
          label={t('account.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('account.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Card className={layout.listCard}>
          <ListRow label={t('account.changePassword')} onClick={pending} />
          <ListRow label={t('account.language')} value={t('account.languageValue')} onClick={pending} last />
        </Card>
        <fieldset className={layout.fieldset}>
          <legend className="sr-only">{t('account.notificationsLabel')}</legend>
          <Checkbox
            label={t('account.remindDayBefore')}
            checked={settings.remindDayBefore}
            onChange={(e) => setSettings((s) => ({ ...s, remindDayBefore: e.target.checked }))}
          />
          <Checkbox label={t('account.remindToRate')} checked={settings.remindToRate} onChange={(e) => setSettings((s) => ({ ...s, remindToRate: e.target.checked }))} />
        </fieldset>
        <button type="button" className={`${layout.textAction} ${layout.start} ${layout.danger}`} onClick={() => setConfirming(true)}>
          {t('account.delete')}
        </button>
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={busy} onClick={() => void save()}>
          {t('account.save')}
        </Button>
      </div>
      <ConfirmSheet
        open={confirming}
        busy={busy}
        title={t('confirm.deleteAccountTitle')}
        text={t('confirm.deleteAccountText')}
        confirmLabel={t('confirm.deleteAccountConfirm')}
        onConfirm={() => void deleteAccount()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  )
}
