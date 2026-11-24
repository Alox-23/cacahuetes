import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayoutProvider, useLayout } from './useLayout'

function Show() {
  return <output data-testid="layout">{useLayout()}</output>
}

type Listener = () => void

/** A controllable matchMedia: `width` decides every (min-width: Npx) query. */
function mockMatchMedia(initial: number) {
  let width = initial
  const listeners = new Set<Listener>()
  const original = window.matchMedia
  window.matchMedia = vi.fn((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      get matches() {
        return width >= min
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    } as unknown as MediaQueryList
  })
  return {
    resize(next: number) {
      width = next
      for (const l of listeners) l()
    },
    restore: () => {
      window.matchMedia = original
    },
  }
}

let restore: (() => void) | undefined
afterEach(() => restore?.())

describe('useLayout', () => {
  it('is "mobile" without matchMedia (jsdom)', () => {
    render(<Show />)
    expect(screen.getByTestId('layout')).toHaveTextContent('mobile')
  })

  it('reads the breakpoints and follows change events', () => {
    const mm = mockMatchMedia(1440)
    restore = mm.restore
    render(<Show />)
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
    act(() => mm.resize(900))
    expect(screen.getByTestId('layout')).toHaveTextContent('tablet')
    act(() => mm.resize(390))
    expect(screen.getByTestId('layout')).toHaveTextContent('mobile')
    act(() => mm.resize(1024))
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
  })

  it('LayoutProvider forces a layout', () => {
    render(
      <LayoutProvider value="desktop">
        <Show />
      </LayoutProvider>,
    )
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
  })
})
