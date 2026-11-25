import { cx } from '../../lib/cx'
import s from './ChaseAnimation.module.css'

const TAIL = 'M0 0C-30 2-38-36-22-50C-12-58 4-54 6-44'
const SHELL =
  'M12 2.5c-2.8 0-5 2.1-5 4.8 0 1.5.6 2.5 1.1 3.4.4.7.4 1.4 0 2.1-.6 1-1.6 2.2-1.6 4.2 0 3 2.5 5 5.5 5s5.5-2 5.5-5c0-2-1-3.2-1.6-4.2-.4-.7-.4-1.4 0-2.1.5-.9 1.1-1.9 1.1-3.4 0-2.7-2.2-4.8-5-4.8z'

/** Three puffs kicked up behind a figure's feet; (0, 0) is where the feet touch the ground. */
function Dust({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[5.5, 4, 4.8].map((r, i) => (
        <circle key={i} className={s.dust} r={r} style={{ animationDelay: `${-i * 0.17}s` }} />
      ))}
    </g>
  )
}

/**
 * Decorative waiting animation (feature 5): Cacahuete (the Mascot shapes) runs from the squirrel of the old
 * Peanut Run game. CSS keyframes on `transform` only. Each animated group sits inside a translated one, so its
 * pivot (hip, tail base) is the local origin and no transform-origin is needed.
 */
export function ChaseAnimation({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={cx(s.chase, className)} aria-hidden="true" focusable="false">
      <path className={s.ground} d="M0 111h340" strokeWidth="3" strokeDasharray="10 8" />
      <Dust x={222} y={105} />
      <g className={s.gap}>
        <Dust x={82} y={105} />
        <g transform="translate(95 108)">
          <g className={s.squirrel} strokeWidth="1.6">
            <path d="M12-16l-1 14M-10-16l5 14" strokeWidth="5" />
            <g transform="translate(-18 -24)">
              <g className={s.tail}>
                <path d={TAIL} strokeWidth="25" />
                <path className={s.tailFur} d={TAIL} strokeWidth="21" />
                <path className={s.tailTip} d={TAIL} strokeWidth="8" />
              </g>
            </g>
            <ellipse cx="1" cy="-24" rx="23" ry="14.5" transform="rotate(-5 1 -24)" />
            <ellipse className={s.belly} cx="6" cy="-15.5" rx="14" ry="6.5" />
            <ellipse cx="-9" cy="-20" rx="11" ry="10.5" />
            <g transform="translate(-9 -14)">
              <g className={s.legA}>
                <path className={s.nearLeg} d="M0 0v12" strokeWidth="6" />
                <ellipse className={s.paw} cx="3" cy="12.5" rx="6" ry="2.8" />
              </g>
            </g>
            <g transform="translate(15 -16)">
              <g className={s.legB}>
                <path className={s.nearLeg} d="M0 0v13" strokeWidth="5" />
                <circle className={s.paw} cx="1" cy="13" r="3.2" />
              </g>
            </g>
            <g transform="translate(21 -34)">
              <path d="M-8-7l1-17 8 12z" />
              <circle r="12.5" />
              <ellipse cx="10" cy="3" rx="8.5" ry="6.5" />
              <ellipse className={s.belly} cx="6" cy="6" rx="7" ry="4.8" />
              <rect className={s.light} x="13.5" y="8" width="3.4" height="4" strokeWidth="0.8" />
              <ellipse className={s.dark} cx="18" cy="1.5" rx="2.8" ry="2.2" />
              <ellipse className={s.dark} cx="4.5" cy="-2.5" rx="2.8" ry="3.3" />
              <circle className={s.light} cx="5.5" cy="-3.8" r="1.1" stroke="none" />
            </g>
          </g>
        </g>
      </g>
      {/* Mascot units (24 x 24), leaning forward; the face is nudged right to look where it runs. */}
      <g transform="translate(196.4 38) scale(2.8) rotate(6 12 24)">
        <g className={s.peanut} strokeWidth="1.1">
          {[10.3, 13.7].map((x, i) => (
            <g key={x} transform={`translate(${x} 20)`}>
              <g className={i ? s.legB : s.legA}>
                <path d="M0 0l-1 4.6" />
                <ellipse className={s.paw} cx="-0.2" cy="4.8" rx="1.7" ry="1" />
              </g>
            </g>
          ))}
          <path d={SHELL} strokeWidth="1.3" />
          <circle className={s.face} cx="11.4" cy="8" r="0.9" />
          <circle className={s.face} cx="15" cy="8" r="0.9" />
          <path className={s.mouth} d="M11.4 10.3c.8.9 2.8.9 3.6 0" />
          <path d="M9.5 17l1.5 1.5M13 16.5l1.5 1.5" strokeWidth="1" />
        </g>
      </g>
    </svg>
  )
}
