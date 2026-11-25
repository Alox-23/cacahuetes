/* Cuenta state, checks and actions (dev's AccountPage logic), shared by the mobile page and the desktop tabs. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AccountSettings } from '../../contract/types'
import { DEFAULT_ACCOUNT_SETTINGS } from '../../data/defaults'
import { t } from '../../i18n'
import { isValidEmail } from '../../lib/validation'
import { useCurrentRoute, useData, useSession, useToast } from '../../state/AppState'

/** Editable copy of the account, saved together through updateAccount. */
export function useAccountForm(onSaved: () => void) {
  const navigate = useNavigate()
  const data = useData()
  const toast = useToast()
  const { session, refreshSession } = useSession()
  const { setCurrentRouteId } = useCurrentRoute()
  const [name, setName] = useState(session.name ?? '')
  const [email, setEmail] = useState(session.email ?? '')
  const [settings, setSettings] = useState<AccountSettings>({ ...DEFAULT_ACCOUNT_SETTINGS, ...session.settings })
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

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
      onSaved()
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

  return { name, setName, email, setEmail, settings, setSettings, errors, busy, confirming, setConfirming, save, deleteAccount }
}

export type AccountFormState = ReturnType<typeof useAccountForm>
