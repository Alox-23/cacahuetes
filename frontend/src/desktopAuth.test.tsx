/* Feature 4 screens on desktop (feature 3 desktop arrangement): dialogs over the view behind. */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Session } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { ApiClientError } from './data/errors'
import { createDataModule } from './data/mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from './data/storage'
import { LayoutProvider } from './lib/useLayout'
import { AUTH_RETURN_KEY } from './pages/auth/afterSignIn'
import { currentPath, renderApp } from './test/renderApp'

const desktop = (children: ReactNode) => <LayoutProvider value="desktop">{children}</LayoutProvider>
const account: Session = { kind: 'account', email: 'eva@ejemplo.com', name: 'Eva', emailVerified: true }

function prefsStorage() {
  const storage = createStorage(memoryBackend())
  storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
  return storage
}

afterEach(() => window.sessionStorage.clear())

describe('feature 4 on desktop', () => {
  it('register from Inicio → Confirma tu correo as a dialog; Esc continues to Mis rutas', async () => {
    const user = userEvent.setup()
    renderApp('/', { wrap: desktop })
    await user.click(await screen.findByRole('link', { name: 'Entrar' }))
    const login = await screen.findByRole('dialog', { name: 'Hola de nuevo' })
    await user.click(within(login).getByRole('button', { name: /Crear una/ }))
    const register = await screen.findByRole('dialog', { name: 'Crea tu cuenta' })
    await user.type(within(register).getByLabelText('Correo electrónico'), 'nuevo@ejemplo.com')
    await user.type(within(register).getByLabelText('Contraseña'), 'corta')
    // The live rule hint of feature 4 shows inside the dialog too.
    expect(within(register).getByText('La contraseña debe tener al menos 12 caracteres.')).toBeInTheDocument()
    await user.type(within(register).getByLabelText('Contraseña'), '-pero-ya-larga')
    await user.click(within(register).getByLabelText('Acepto los términos y la política de privacidad'))
    await user.click(within(register).getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(currentPath()).toBe('/verify-pending'))
    const verify = await screen.findByRole('dialog', { name: 'Revisa tu correo' })
    expect(verify).toHaveTextContent('nuevo@ejemplo.com')
    // Behind it: Inicio, where the flow started.
    expect(screen.getByRole('heading', { level: 1, name: 'Marbella a tu ritmo' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe('/my-routes'))
  })

  it('/verify-email with the demo link: "Correo confirmado" dialog over the chat; the settings notice disappears', async () => {
    const user = userEvent.setup()
    const storage = prefsStorage()
    await createDataModule(storage, { latency: 0 }).register('ana@ejemplo.com', 'una-clave-larga')
    const token = storage.read<{ token: string } | null>(STORAGE_KEYS.verifyToken, null)?.token ?? ''
    renderApp(`/verify-email?token=${token}`, { storage, wrap: desktop })
    const dialog = await screen.findByRole('dialog', { name: 'Correo confirmado' })
    expect(dialog).toHaveTextContent('ana@ejemplo.com')
    expect(screen.getByRole('region', { name: 'Chat con el asistente' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('link', { name: 'Ir a mis rutas' }))
    await waitFor(() => expect(currentPath()).toBe('/my-routes'))
    await user.click(screen.getByRole('link', { name: 'Perfil' }))
    await screen.findByRole('region', { name: 'Perfil' })
    expect(screen.queryByText('Confirma tu correo para proteger tu cuenta.')).not.toBeInTheDocument()
  })

  it('an unverified account sees the notice in the desktop settings', async () => {
    const storage = prefsStorage()
    await createDataModule(storage, { latency: 0 }).register('leo@ejemplo.com', 'una-clave-larga')
    renderApp('/profile', { storage, wrap: desktop })
    const settings = await screen.findByRole('region', { name: 'Perfil' })
    expect(await within(settings).findByText('Confirma tu correo para proteger tu cuenta.')).toBeInTheDocument()
  })

  it('/auth/callback signs in and returns to the stored returnTo; an error is a dialog that offers to retry', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ returnTo: '/preferences' }))
    let signedIn = false
    const ok = renderApp('/auth/callback#state=s&ticket=t', {
      storage: prefsStorage(),
      wrap: desktop,
      mapData: (d) => ({
        ...d,
        getSession: async () => (signedIn ? account : { kind: 'guest' }),
        completeSignIn: async () => {
          signedIn = true
          return account
        },
      }),
    })
    await waitFor(() => expect(currentPath()).toBe('/preferences'))
    expect(await screen.findByRole('region', { name: 'Perfil' })).toBeInTheDocument()
    ok.unmount()

    renderApp('/auth/callback#state=s&error=invalid_state', {
      storage: prefsStorage(),
      wrap: desktop,
      mapData: (d) => ({ ...d, completeSignIn: () => Promise.reject(new ApiClientError('invalid_state', 'INVALID_STATE', 400)) }),
    })
    const dialog = await screen.findByRole('dialog', { name: 'No se ha podido entrar' })
    await user.click(within(dialog).getByRole('link', { name: 'Volver a intentarlo' }))
    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(await screen.findByRole('dialog', { name: 'Hola de nuevo' })).toBeInTheDocument()
  })
})
