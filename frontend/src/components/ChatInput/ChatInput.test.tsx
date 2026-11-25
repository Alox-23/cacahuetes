import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('is a labelled textarea; send is disabled while empty', () => {
    render(<ChatInput placeholder="Escribe" onSend={() => undefined} />)
    const field = screen.getByRole('textbox', { name: 'Mensaje para el asistente' })
    expect(field.tagName).toBe('TEXTAREA')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('Enter sends the trimmed text and clears the field', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput placeholder="Escribe" onSend={onSend} />)
    const field = screen.getByRole('textbox')
    await user.type(field, '  hola  {Enter}')
    expect(onSend).toHaveBeenCalledWith('hola')
    expect(field).toHaveValue('')
  })

  it('Shift+Enter inserts a line break and does not send', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput placeholder="Escribe" onSend={onSend} />)
    const field = screen.getByRole('textbox')
    await user.type(field, 'uno{Shift>}{Enter}{/Shift}dos')
    expect(onSend).not.toHaveBeenCalled()
    expect(field).toHaveValue('uno\ndos')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSend).toHaveBeenCalledWith('uno\ndos')
  })

  it('Enter on an empty field or while disabled sends nothing', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput placeholder="Escribe" onSend={onSend} />)
    await user.type(screen.getByRole('textbox'), '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    rerender(<ChatInput placeholder="Escribe" onSend={onSend} disabled />)
    await user.type(screen.getByRole('textbox'), 'hola{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })
})
