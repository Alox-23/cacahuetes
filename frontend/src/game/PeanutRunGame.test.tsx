import { fireEvent, render, waitFor } from '@testing-library/react'
import { stubCanvas } from '../test/fakeCanvas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PeanutRunGame } from './PeanutRunGame'

describe('PeanutRunGame wrapper', () => {
  afterEach(() => vi.restoreAllMocks())

  it('without a canvas context it renders an empty slot and reports "ready" once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onStateChange = vi.fn()
    const { container } = render(<PeanutRunGame onStateChange={onStateChange} />)
    expect(container.querySelector('.peanut-run')).toBeNull()
    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(onStateChange).toHaveBeenCalledWith('ready')
    warn.mockRestore()
  })

  it('mounts the Spanish game, reports state changes and destroys it on unmount', async () => {
    stubCanvas()
    const onStateChange = vi.fn()
    const { container, unmount } = render(<PeanutRunGame onStateChange={onStateChange} />)
    const root = container.querySelector('.peanut-run')
    expect(root).toHaveAttribute('aria-label', 'Juego Cacahuete Run. Toca o pulsa espacio para saltar.')
    expect(document.activeElement).not.toBe(root) // autoFocus: false
    expect(onStateChange).toHaveBeenLastCalledWith('ready')

    fireEvent.pointerDown(root!.querySelector('canvas')!, { button: 0 })
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith('running'))
    expect(onStateChange).toHaveBeenCalledTimes(2)

    unmount()
    expect(container.querySelector('.peanut-run')).toBeNull()
  })
})
