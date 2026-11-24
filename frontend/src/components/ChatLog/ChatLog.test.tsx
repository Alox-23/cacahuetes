import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ChatLog } from './ChatLog'

/** jsdom has no layout: give the log a fixed geometry. */
function geometry(el: HTMLElement, scrollHeight: number, clientHeight = 400) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

describe('ChatLog', () => {
  it('sticks to the bottom only when the reader is near it; otherwise shows "Mensaje nuevo"', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ChatLog scrollKey={1}>a</ChatLog>)
    const log = screen.getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    geometry(log, 1000)

    // Near the bottom: a new message scrolls into view.
    rerender(<ChatLog scrollKey={2}>a b</ChatLog>)
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Mensaje nuevo' })).not.toBeInTheDocument()

    // The reader scrolls up: new content leaves the position alone.
    log.scrollTop = 100
    fireEvent.scroll(log)
    geometry(log, 1200)
    rerender(<ChatLog scrollKey={3}>a b c</ChatLog>)
    expect(log.scrollTop).toBe(100)
    await user.click(screen.getByRole('button', { name: 'Mensaje nuevo' }))
    expect(log.scrollTop).toBe(1200)
    expect(screen.queryByRole('button', { name: 'Mensaje nuevo' })).not.toBeInTheDocument()

    // After the user sends, the newest message is always shown.
    log.scrollTop = 0
    act(() => {
      fireEvent.scroll(log)
    })
    geometry(log, 1400)
    rerender(
      <ChatLog scrollKey={4} forceScroll>
        a b c d
      </ChatLog>,
    )
    expect(log.scrollTop).toBe(1400)
  })
})
