/* Preferencias de viaje (Preferencias.html): mobile wrapper around the preferences form (features/profile). */
import { Header, Screen } from '../components'
import { PreferencesForm } from '../features/profile/PreferencesForm'
import { t } from '../i18n'
import { useBack } from '../lib/useBack'
import layout from './layout.module.css'

export function PreferencesPage() {
  const back = useBack('/profile')
  return (
    <Screen fixed className={layout.page}>
      <PreferencesForm onSaved={back} top={<Header onBack={back} label={t('preferences.header')} className={layout.header} />} />
    </Screen>
  )
}
