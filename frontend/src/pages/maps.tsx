/* Static map illustration copied from Main.html (colors via tokens). */
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
