import { stubCanvas, type CanvasCall } from '../test/fakeCanvas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameStrings } from './gameStrings'
import { HIGH_SCORE_KEY, SOUND_KEY } from './PeanutRunGame'
import { createPeanutRun, DEFAULT_STRINGS } from './peanut-run/index.js'

describe('vendored Peanut Run engine', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    stubCanvas()
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    container.remove()
  })

  it('builds its DOM with the Spanish strings and starts in "ready"', () => {
    const game = createPeanutRun(container, {
      autoFocus: false,
      highScoreKey: HIGH_SCORE_KEY,
      soundKey: SOUND_KEY,
      strings: gameStrings(),
    })
    const root = container.querySelector('.peanut-run')
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute('role', 'application')
    expect(root).toHaveAttribute('aria-label', 'Juego Cacahuete Run. Toca o pulsa espacio para saltar.')
    const text = root?.textContent ?? ''
    for (const s of [
      'Cacahuete Run',
      'Toca o pulsa espacio para empezar',
      'En pausa',
      'Toca o pulsa espacio para seguir',
      '¡La ardilla te ha pillado!',
      'Puntos',
      'Mejor',
      '¡Nuevo récord!',
      '¿Otra partida?',
      'Sí',
      'No',
      '¡Gracias por jugar!',
      'Puntuación final: 0',
      'Jugar',
    ]) {
      expect(text).toContain(s)
    }
    expect(text).not.toMatch(/Play again|Score|squirrel/)
    const mute = container.querySelector('.peanut-run__mute')
    expect(mute).toHaveAttribute('aria-label', 'Silenciar')
    expect(mute).toHaveAttribute('title', 'Sonido activado (M)')
    expect(document.activeElement).not.toBe(root)
    expect(game.getState().state).toBe('ready')
    game.destroy()
  })

  it('labels the mute button for the muted state and persists it under the app key', () => {
    const game = createPeanutRun(container, { autoFocus: false, soundKey: SOUND_KEY, strings: gameStrings() })
    game.setMuted(true)
    expect(container.querySelector('.peanut-run__mute')).toHaveAttribute('aria-label', 'Activar sonido')
    expect(window.localStorage.getItem(SOUND_KEY)).toBe('1')
    game.destroy()
  })

  it('keeps the English defaults when no strings are given', () => {
    const game = createPeanutRun(container, { autoFocus: false, highScoreKey: null, soundKey: null })
    const root = container.querySelector('.peanut-run')
    expect(root).toHaveAttribute('aria-label', DEFAULT_STRINGS.ariaLabel)
    expect(root?.textContent).toContain('Play again?')
    expect(root?.textContent).toContain('Final score: 0')
    expect(container.querySelector('.peanut-run__mute')).toHaveAttribute('aria-label', 'Mute sound')
    game.destroy()
  })

  it('destroy() removes the root and is idempotent', () => {
    const game = createPeanutRun(container, { autoFocus: false, highScoreKey: null, soundKey: null })
    expect(container.children).toHaveLength(1)
    game.destroy()
    expect(container.children).toHaveLength(0)
    expect(() => game.destroy()).not.toThrow()
    expect(container.children).toHaveLength(0)
  })

  it('resize(): a container taller than 800:300 keeps the width scale and adds sky above the band (spec §11)', () => {
    const calls: CanvasCall[] = []
    vi.restoreAllMocks()
    stubCanvas(calls)
    // jsdom has no layout: the root (and the canvas filling it) are 342 × 280 CSS px.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ x: 0, y: 0, top: 0, left: 0, right: 342, bottom: 280, width: 342, height: 280, toJSON: () => ({}) }) as DOMRect,
    )
    const game = createPeanutRun(container, { autoFocus: false, highScoreKey: null, soundKey: null })
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(342)
    expect(canvas.height).toBe(280) // from the container height, not 342 × 300 / 800 ≈ 128
    // The world is translated down by offsetY = round((280 / (342 / 800) - 300) × 0.65) = 231 logical units.
    const translate = calls.find(([name]) => name === 'translate')
    const offsetY = (translate?.[1] as number[])[1]
    expect(offsetY).toBeGreaterThan(0)
    expect(offsetY).toBe(231)
    // Uniform scale from the width.
    expect(calls.find(([name]) => name === 'setTransform')?.[1]).toEqual([342 / 800, 0, 0, 342 / 800, 0, 0])
    game.destroy()
  })

  it('resize(): an 800:300 container keeps the band unshifted', () => {
    const calls: CanvasCall[] = []
    vi.restoreAllMocks()
    stubCanvas(calls)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 150, width: 400, height: 150, toJSON: () => ({}) }) as DOMRect,
    )
    const game = createPeanutRun(container, { autoFocus: false, highScoreKey: null, soundKey: null })
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([400, 150])
    expect((calls.find(([name]) => name === 'translate')?.[1] as number[])[1]).toBe(0)
    game.destroy()
  })
})
