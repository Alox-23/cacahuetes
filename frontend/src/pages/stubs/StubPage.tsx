import { useLocation, useNavigate } from 'react-router-dom'
import { Header, Screen, type TabKey } from '../../components'
import { t } from '../../i18n'
import styles from './StubPage.module.css'

type StubPageProps = { title: string; tabBar?: TabKey }

/** Placeholder for screens owned by spec 2. */
export function StubPage({ title, tabBar }: StubPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/chat'))
  return (
    <Screen tabBar={tabBar} className={styles.page}>
      <Header title={title} onBack={back} />
      <p className={styles.text}>{t('stub.pending')}</p>
    </Screen>
  )
}
