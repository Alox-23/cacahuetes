import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  try {
    window.localStorage.clear()
  } catch {
    // ignore
  }
})

// jsdom has no canvas: report "no 2D context" quietly instead of its "Not implemented" error.
// Tests that need a context (src/game/peanutRun.test.ts) stub it themselves.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
