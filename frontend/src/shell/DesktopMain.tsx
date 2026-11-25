import { useLocation } from 'react-router-dom'
import { Button, Mascot, RouteMap } from '../components'
import { t } from '../i18n'
import { usePreferences } from '../state/AppState'
import styles from './DesktopMain.module.css'

const EXAMPLE = ['s1', 's2', 's3', 's4'] as const

/** Inicio on desktop (DeskInicio.html): message and button left, example route right, no sidebar or chat. */
export function DesktopMain() {
  const { preferences } = usePreferences()
  const { pathname } = useLocation()
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.logo}>
          <Mascot size={36} />
          {t('app.name')}
        </span>
        <Button to="/login" state={{ background: pathname === '/login' || pathname === '/register' ? '/' : pathname }} variant="secondary" className={styles.medium}>
          {t('main.enter')}
        </Button>
      </header>
      <main className={styles.columns}>
        <div className={styles.message}>
          <h1 className={styles.title}>{t('main.title')}</h1>
          <p className={styles.subtitle}>{t('main.subtitle')}</p>
          <Button to={preferences ? '/chat' : '/onboarding'} className={styles.medium}>
            {t('main.cta')}
          </Button>
          <p className={styles.note}>{t('desktop.mainNote')}</p>
        </div>
        <section className={styles.card} aria-label={t('desktop.exampleLabel')}>
          <RouteMap stops={EXAMPLE.map((_, i) => ({ order: i + 1 }))} variant="wide" className={styles.map} />
          <div className={styles.body}>
            <span className={styles.cardTitle}>{t('main.exampleTitle')}</span>
            <ol className={styles.rows}>
              {EXAMPLE.map((key, i) => (
                <li key={key} className={styles.row}>
                  <span className={styles.badge} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.text}>
                    <span className={styles.name}>{t(`main.exampleStops.${key}.name`)}</span>
                    <span className={styles.detail}>{t(`main.exampleStops.${key}.detail`)}</span>
                  </span>
                  <span className={styles.time}>{t(`main.exampleStops.${key}.time`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  )
}
