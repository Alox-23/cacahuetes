import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cx } from '../lib/cx'
import { gameStrings } from './gameStrings'
import { createPeanutRun, type PeanutRunInstance, type PeanutRunSnapshot, type PeanutRunState } from './peanut-run/index.js'
import './peanut-run/peanut-run.css'
import styles from './PeanutRunGame.module.css'

export type { PeanutRunSnapshot, PeanutRunState }

export type PeanutRunHandle = {
  getState(): PeanutRunSnapshot
  pause(): void
  resume(): void
  restart(): void
}

type PeanutRunGameProps = {
  /** ready | running | caught | gameover | exited; called only when the state changes. */
  onStateChange?: (state: PeanutRunState) => void
  onGameOver?: (score: number, highScore: number) => void
  /** The player answered "No" to "¿Otra partida?". */
  onExit?: (score: number) => void
  className?: string
}

export const HIGH_SCORE_KEY = 'rt.peanutRun.highScore'
export const SOUND_KEY = 'rt.peanutRun.muted'
const POLL_MS = 250

const IDLE: PeanutRunSnapshot = { state: 'ready', score: 0, highScore: 0, paused: false, muted: false, speed: 0 }

/** The engine needs a 2D canvas; jsdom and very old browsers have none. */
function canvasAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('2d') !== null
  } catch {
    return false
  }
}

let warned = false

/** Peanut Run (vendored engine in ./peanut-run) mounted in a slot. Renders nothing without canvas. */
export const PeanutRunGame = forwardRef<PeanutRunHandle, PeanutRunGameProps>(function PeanutRunGame(
  { onStateChange, onGameOver, onExit, className },
  ref,
) {
  const slot = useRef<HTMLDivElement>(null)
  const game = useRef<PeanutRunInstance | null>(null)
  const callbacks = useRef({ onStateChange, onGameOver, onExit })

  useEffect(() => {
    callbacks.current = { onStateChange, onGameOver, onExit }
  })

  useImperativeHandle(
    ref,
    () => ({
      getState: () => game.current?.getState() ?? IDLE,
      pause: () => game.current?.pause(),
      resume: () => game.current?.resume(),
      restart: () => game.current?.restart(),
    }),
    [],
  )

  // Create once; the cleanup destroys it (StrictMode mounts, unmounts and remounts).
  useEffect(() => {
    const container = slot.current
    if (!container) return
    let instance: PeanutRunInstance | null = null
    try {
      if (!canvasAvailable()) throw new Error('Canvas 2D is not available')
      instance = createPeanutRun(container, {
        sound: true,
        autoFocus: false,
        highScoreKey: HIGH_SCORE_KEY,
        soundKey: SOUND_KEY,
        strings: gameStrings(),
        onGameOver: (score, high) => callbacks.current.onGameOver?.(score, high),
        onExit: (score) => callbacks.current.onExit?.(score),
      })
    } catch (error) {
      container.replaceChildren()
      if (!warned) {
        warned = true
        console.warn('[peanut-run] game unavailable', error)
      }
      callbacks.current.onStateChange?.('ready')
      return
    }
    game.current = instance

    // The engine has no state-change event: poll lightly and report changes only.
    let last: PeanutRunState | null = null
    const poll = () => {
      const state = instance.getState().state
      if (state !== last) {
        last = state
        callbacks.current.onStateChange?.(state)
      }
    }
    poll()
    const timer = window.setInterval(poll, POLL_MS)
    return () => {
      window.clearInterval(timer)
      instance.destroy()
      if (game.current === instance) game.current = null
    }
  }, [])

  return <div ref={slot} className={cx(styles.slot, className)} />
})
