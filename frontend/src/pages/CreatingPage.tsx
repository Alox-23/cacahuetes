import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Mascot, Screen } from '../components'
import { requestSubtitle } from '../assistant/format'
import { t } from '../i18n'
import { useCreation } from '../state/AppState'
import { CreationSteps } from './chat/CreationSteps'
import { LoadingMap } from './maps'
import styles from './CreatingPage.module.css'

/** Creando la ruta (mobile). The creation itself runs in the provider (feature 3 §4.4). */
export function CreatingPage() {
  const navigate = useNavigate()
  const { creation, cancelCreation } = useCreation()
  if (!creation) return <Navigate to="/chat" replace />
  const { request } = creation

  return (
    <Screen className={styles.page}>
      <div className={styles.center}>
        <LoadingMap label={t('creating.mapLabel')} />
        <div className={styles.titleRow}>
          <Mascot size={56} className={styles.pulse} />
          <div className={styles.titles}>
            <h1 className={styles.title}>{t('creating.title')}</h1>
            <p className={styles.subtitle}>{requestSubtitle(request)}</p>
          </div>
        </div>
        {creation.status === 'failed' ? (
          <p role="alert" className={styles.subtitle}>
            {t('creating.error')}
          </p>
        ) : (
          <Card padding="12px 20px">
            <CreationSteps step={creation.step} />
          </Card>
        )}
      </div>
      <Button
        variant="text"
        className={styles.cancel}
        onClick={() => {
          cancelCreation()
          navigate('/chat/conversation', { replace: true })
        }}
      >
        {t('common.cancel')}
      </Button>
    </Screen>
  )
}
