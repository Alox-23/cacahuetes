import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from './test/renderApp'

describe('chat component (spec 4)', () => {
  it('keeps answered options visible but disabled, with the choice pressed', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding')
    await screen.findByText('Pregunta 1 de 4')
    await user.click(screen.getByRole('button', { name: 'Museos' }))
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await screen.findByText('Pregunta 2 de 4')

    const museos = screen.getByRole('button', { name: 'Museos' })
    expect(museos).toBeDisabled()
    expect(museos).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Historia' })).toHaveAttribute('aria-pressed', 'false')
    // Only the live question has a "Listo" button.
    expect(screen.getAllByRole('button', { name: 'Listo' })).toHaveLength(1)
    // The echo is a user bubble whose author is named for screen readers.
    const log = screen.getByRole('log')
    expect(within(log).getByText('Museos', { selector: 'div' })).toHaveTextContent('Tú: Museos')
  })
})
