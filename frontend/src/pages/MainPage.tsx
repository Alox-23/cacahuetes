import { Link } from 'react-router-dom'
import { Button, Card, Mascot, Screen } from '../components'
import { t } from '../i18n'
import { usePreferences } from '../state/AppState'
import { ExampleMap } from './maps'
import styles from './MainPage.module.css'

const EXAMPLE_STOPS = ['s1', 's2', 's3', 's4'] as const

export function MainPage() {
  const { preferences } = usePreferences()
  return (
    <Screen className={styles.page}>
      <div className={styles.top}>
        <span className={styles.logo}>
          <Mascot size={28} />
          {t('app.name')}
        </span>
        <Link to="/login" className={styles.enter}>
          {t('main.enter')}
        </Link>
      </div>

      <div className={styles.hero}>
        <h1 className={styles.title}>{t('main.title')}</h1>
        <p className={styles.subtitle}>{t('main.subtitle')}</p>
      </div>

      <Card className={styles.example}>
        <ExampleMap />
        <div className={styles.exampleBody}>
          <div className={styles.exampleTitle}>{t('main.exampleTitle')}</div>
          <ul className={styles.rows}>
            {EXAMPLE_STOPS.map((key) => (
              <li key={key} className={styles.row}>
                <span>{t(`main.exampleStops.${key}.name`)}</span>
                <span className={styles.time}>{t(`main.exampleStops.${key}.time`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className={styles.bottom}>
        <Button to={preferences ? '/chat' : '/onboarding'} fullWidth>
          {t('main.cta')}
        </Button>
        <p className={styles.note}>{t('main.note')}</p>
      </div>
    </Screen>
  )
}
