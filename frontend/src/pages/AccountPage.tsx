/* Cuenta (Cuenta.html): mobile wrapper around the account fields (features/profile). */
import { Button, Header, Screen } from '../components'
import { AccountSettingsFields, PersonalFields } from '../features/profile/AccountForm'
import { UnverifiedNotice } from '../features/profile/UnverifiedNotice'
import { useAccountForm } from '../features/profile/useAccountForm'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'

export function AccountPage() {
  const back = useBack('/profile')
  const form = useAccountForm(back)
  return (
    <Screen fixed className={layout.page}>
      <div className={layout.body}>
        <Header onBack={back} label={t('account.header')} className={layout.header} />
        <UnverifiedNotice />
        <div className={layout.spacer} />
        <PersonalFields form={form} />
        <AccountSettingsFields form={form} />
      </div>
      <div className={layout.footer}>
        <Button fullWidth disabled={form.busy} onClick={() => void form.save()}>
          {t('account.save')}
        </Button>
      </div>
    </Screen>
  )
}
