import { vi } from 'vitest'

export type CanvasCall = [method: string, args: unknown[]]

/**
 * Minimal 2D context: every method is a no-op; gradients and text metrics return stubs.
 * With `calls`, every method call is recorded there as [name, args].
 */
function fakeContext(calls?: CanvasCall[]): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} }
  const special: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
  }
  const props: Record<string, unknown> = {}
  return new Proxy(props, {
    get: (target, key: string) => {
      if (!(key in special) && key in target) return target[key]
      const fn = (key in special ? special[key] : () => {}) as (...args: unknown[]) => unknown
      return calls ? (...args: unknown[]) => (calls.push([key, args]), fn(...args)) : fn
    },
    set: (target, key: string, value) => {
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

/** Give every canvas a fake 2D context (jsdom has none). Undo with vi.restoreAllMocks(). */
export function stubCanvas(calls?: CanvasCall[]) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => fakeContext(calls)) as unknown as typeof HTMLCanvasElement.prototype.getContext)
}
