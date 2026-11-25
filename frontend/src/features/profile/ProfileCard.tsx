/* User card of Perfil (Perfil.html): initial avatar, name and email, or the guest card with its two buttons. */
import { useLocation } from 'react-router-dom'
import { Button, Card } from '../../components'
import { t } from '../../i18n'
import { useSession } from '../../state/AppState'
import styles from './ProfileCard.module.css'

export function ProfileCard() {
  const { session, isAccount } = useSession()
  // The desktop dialogs for register / login keep this view behind them.
  const background = { background: useLocation().pathname }
  const name = session.name || session.email || ''
  return (
    <Card padding="16px 20px" className={styles.userCard}>
      <div className={styles.user}>
        <div aria-hidden="true" className={styles.avatar}>
          {isAccount ? name.charAt(0).toLocaleUpperCase('es') : t('profile.guestAvatar')}
        </div>
        <div className={styles.userText}>
          <span className={styles.userName}>{isAccount ? name : t('profile.guestName')}</span>
          <span className={styles.userMeta}>{isAccount ? session.email : t('profile.guestText')}</span>
        </div>
      </div>
      {!isAccount && (
        <div className={styles.guestActions}>
          <Button to="/register" state={background} className={styles.guestButton}>
            {t('profile.register')}
          </Button>
          <Button to="/login" state={background} variant="secondary" className={styles.guestButton}>
            {t('profile.login')}
          </Button>
        </div>
      )}
    </Card>
  )
}
