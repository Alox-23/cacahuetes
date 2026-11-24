/* Typings for the vendored Peanut Run engine (index.js). Ours, not part of the upstream branch. */

export type PeanutRunState = 'ready' | 'running' | 'caught' | 'gameover' | 'exited'

/** Every piece of UI text the engine writes. Defaults are English (DEFAULT_STRINGS). */
export type PeanutRunStrings = {
  title: string
  startHint: string
  paused: string
  pausedHint: string
  caught: string
  score: string
  best: string
  newHigh: string
  playAgain: string
  yes: string
  no: string
  thanks: string
  finalScore: (score: number) => string
  play: string
  ariaLabel: string
  /** aria-label of the sound button while sound is on. */
  mute: string
  /** aria-label of the sound button while sound is off. */
  unmute: string
  /** Tooltip (title) of the sound button while sound is on. */
  soundOn: string
  /** Tooltip (title) of the sound button while sound is off. */
  soundOff: string
}

export type PeanutRunOptions = {
  onGameOver?: (score: number, highScore: number) => void
  onExit?: (score: number) => void
  highScoreKey?: string | null
  sound?: boolean
  soundKey?: string | null
  autoFocus?: boolean
  strings?: Partial<PeanutRunStrings>
}

export type PeanutRunSnapshot = {
  state: PeanutRunState
  score: number
  highScore: number
  paused: boolean
  muted: boolean
  speed: number
}

export type PeanutRunInstance = {
  pause(): void
  resume(): void
  restart(): void
  setMuted(muted: boolean): void
  isMuted(): boolean
  getState(): PeanutRunSnapshot
  destroy(): void
}

export const DEFAULT_STRINGS: Readonly<PeanutRunStrings>

export function createPeanutRun(container: HTMLElement, options?: PeanutRunOptions): PeanutRunInstance

export default createPeanutRun
