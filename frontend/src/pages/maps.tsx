/* Static map illustrations copied from Main.html and Cargando.html (colors via tokens). */
import styles from './maps.module.css'

export function ExampleMap() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 342 150" className={styles.example}>
      <path className={styles.water} d="M0 118 C80 100 150 140 342 112 L342 150 L0 150 Z" />
      <path className={styles.streets} d="M0 40 H342 M0 84 H342 M70 0 V150 M160 0 V150 M250 0 V150" strokeWidth="6" />
      <path className={styles.routeDotted} d="M48 96 L70 40 L160 40 L205 84 L290 62" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" />
      <circle className={styles.start} cx="48" cy="96" r="10" />
      <circle className={styles.stop} cx="70" cy="40" r="10" />
      <circle className={styles.stop} cx="160" cy="40" r="10" />
      <circle className={styles.stop} cx="205" cy="84" r="10" />
      <circle className={styles.stop} cx="290" cy="62" r="10" />
    </svg>
  )
}

export function LoadingMap({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 390 170" preserveAspectRatio="xMidYMid slice" className={styles.loading}>
      <path className={styles.streets} d="M0 60 H390 M0 124 H390 M80 0 V230 M180 0 V230 M290 0 V230" strokeWidth="7" />
      <path className={styles.route} d="M56 150 L80 60 L180 60 L236 124 L326 96" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle className={styles.startRing} cx="56" cy="150" r="9" strokeWidth="3" />
      <circle className={styles.stop} cx="80" cy="60" r="11" />
      <circle className={styles.stop} cx="180" cy="60" r="11" />
      <circle className={styles.stop} cx="236" cy="124" r="11" />
      <circle className={styles.stop} cx="326" cy="96" r="11" />
    </svg>
  )
}
