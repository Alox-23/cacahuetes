/* Perfil (Perfil.html): user card (or guest card), settings list, preference chips and sign out. */
import { useState } from 'react'
import { Card, Chip, ConfirmSheet, ListRow, Screen } from '../components'
import { ProfileCard } from '../features/profile/ProfileCard'
import { budgetChip, companyLabel, interestLabel, paceLabel } from '../assistant/format'
import type { Preferences } from '../contract/types'
import { t } from '../i18n'
import { useData, usePreferences, useSession, useToast } from '../state/AppState'
import layout from './layout.module.css'
import styles from './ProfilePage.module.css'

/** Chips as in Perfil.html: interests, pace, company and budget. */
function profileChips(p: Preferences): string[] {
  return [...p.interests.map(interestLabel), paceLabel(p.pace), companyLabel(p.company), budgetChip(p.budget)]
}

export function ProfilePage() {
  const data = useData()
  const { isAccount, refreshSession } = useSession()
  const { preferences } = usePreferences()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = () => toast.show(t('toast.pending'))

  async function logout() {
    setBusy(true)
    try {
      await data.logout()
      await refreshSession()
      setConfirming(false)
      toast.show(t('toast.loggedOut'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={layout.h1}>{t('profile.title')}</h1>
      </div>

      <ProfileCard />

      <nav aria-label={t('profile.menuLabel')}>
        <Card className={layout.listCard}>
          <ListRow label={t('profile.preferences')} to="/preferences" />
          {isAccount && <ListRow label={t('profile.account')} to="/account" />}
          {isAccount ? (
            <ListRow label={t('profile.language')} value={t('profile.languageValue')} to="/account" />
          ) : (
            <ListRow label={t('profile.language')} value={t('profile.languageValue')} onClick={pending} />
          )}
          <ListRow label={t('profile.help')} onClick={pending} last />
        </Card>
      </nav>

      {preferences && (
        <div className={layout.chips} role="group" aria-label={t('profile.chipsLabel')}>
          {profileChips(preferences).map((c, i) => (
            <Chip key={`${c}-${i}`}>{c}</Chip>
          ))}
        </div>
      )}

      {isAccount && (
        <button type="button" className={`${layout.textAction} ${layout.start}`} onClick={() => setConfirming(true)}>
          {t('profile.logout')}
        </button>
      )}

      <ConfirmSheet
        open={confirming}
        busy={busy}
        title={t('confirm.logoutTitle')}
        text={t('confirm.logoutText')}
        confirmLabel={t('confirm.logoutConfirm')}
        onConfirm={() => void logout()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  )
}
