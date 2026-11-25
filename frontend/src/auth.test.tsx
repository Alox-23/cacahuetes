import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataModule, Session } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { ApiClientError } from './data/errors'
import { createDataModule } from './data/mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from './data/storage'
import { AUTH_RETURN_KEY } from './pages/auth/afterSignIn'
import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function setup() {
  const storage = createStorage(memoryBackend())
  storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
  const data = createDataModule(storage, { latency: 0 })
  return { storage, data }
}

function renderApp(path: string, data: DataModule, storage = createStorage(memoryBackend())) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider data={data} storage={storage} assistantDelay={() => Promise.resolve()}>
        <AppRoutes />
        <Location />
      </AppStateProvider>
    </MemoryRouter>,
  )
}

const location = () => screen.getByTestId('location').textContent
const demoToken = (storage: ReturnType<typeof setup>['storage']) =>
  storage.read<{ token: string } | null>(STORAGE_KEYS.verifyToken, null)?.token ?? ''

async function fillRegister(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Correo electrónico'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByLabelText('Acepto los términos y la política de privacidad'))
}

afterEach(() => {
  window.sessionStorage.clear()
})

describe('feature 4 · Crear cuenta / Entrar', () => {
  it('shows the first unmet rule while typing and blocks short passwords or ones containing the email', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    renderApp('/register', ctx.data, ctx.storage)
    const password = await screen.findByLabelText('Contraseña')
    expect(password).toHaveAttribute('placeholder', 'Mínimo 12 caracteres')
    expect(password).toHaveAttribute('type', 'password')

    await user.type(screen.getByLabelText('Correo electrónico'), 'lucia@ejemplo.com')
    await user.type(password, 'abc')
    const hint = screen.getByText('La contraseña debe tener al menos 12 caracteres.')
    expect(password).not.toHaveAttribute('aria-invalid')
    expect(password).toHaveAttribute('aria-describedby', hint.id)

    // Show / hide toggle.
    const toggle = screen.getByRole('button', { name: 'Mostrar' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-pressed', 'true')

    // Ten characters: refused before any request.
    await user.type(password, 'defghij')
    await user.click(screen.getByLabelText('Acepto los términos y la política de privacidad'))
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('La contraseña debe tener al menos 12 caracteres.')).toBeInTheDocument()
    expect(location()).toBe('/register')

    await user.clear(password)
    await user.type(password, 'soy-lucia-de-marbella')
    expect(screen.getByText('La contraseña no puede contener tu correo.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(location()).toBe('/register')
    expect(await ctx.data.getSession()).toEqual({ kind: 'guest' })
  })

  it('shows the server errors: email already registered under the field, wrong password above the buttons', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    const data: DataModule = {
      ...ctx.data,
      register: () => Promise.reject(new ApiClientError('Ya existe', 'EMAIL_EXISTS', 409)),
      login: () => Promise.reject(new ApiClientError('Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS', 401)),
    }
    renderApp('/register', data, ctx.storage)
    await screen.findByLabelText('Contraseña')
    await fillRegister(user, 'ana@ejemplo.com', 'rutas-por-el-casco')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Ya existe una cuenta con este correo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
    expect(location()).toBe('/register')

    await user.click(screen.getByRole('button', { name: '¿Ya tienes cuenta? Entrar' }))
    await waitFor(() => expect(location()).toBe('/login'))
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.com')
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    expect(location()).toBe('/login')
  })

  it('a new account lands on Confirma tu correo; Continuar goes to Mis rutas', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    renderApp('/register', ctx.data, ctx.storage)
    await screen.findByLabelText('Contraseña')
    await fillRegister(user, 'nuria@ejemplo.com', 'paseo-por-la-alameda')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(location()).toBe('/verify-pending'))
    expect(screen.getByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(screen.getByText('Te hemos enviado un enlace a nuria@ejemplo.com. Ábrelo para confirmar tu cuenta.')).toBeInTheDocument()

    const before = demoToken(ctx.storage)
    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }))
    expect(await screen.findByText('Correo enviado')).toBeInTheDocument()
    expect(demoToken(ctx.storage)).not.toBe(before)

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))
  })

  it('without providers there are no Google/Apple buttons and no divider', async () => {
    const ctx = setup()
    renderApp('/login', { ...ctx.data, authProviders: () => Promise.resolve([]) }, ctx.storage)
    await screen.findByLabelText('Contraseña')
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar con Apple' })).not.toBeInTheDocument()
    expect(screen.queryByText('o con tu correo')).not.toBeInTheDocument()
  })

  it('the demo Google button signs in as an existing account', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    renderApp('/login', ctx.data, ctx.storage)
    await user.click(await screen.findByRole('button', { name: 'Continuar con Google' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))
    expect(await ctx.data.getSession()).toMatchObject({ kind: 'account', email: 'google@ejemplo.com', emailVerified: true })
    expect(await screen.findByRole('list', { name: 'Rutas guardadas' })).toBeInTheDocument()
  })
})

describe('feature 4 · email verification', () => {
  it('the demo link confirms the email and the Perfil notice disappears', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    await ctx.data.register('rosa@ejemplo.com', 'una-clave-bien-larga')
    const first = renderApp('/profile', ctx.data, ctx.storage)
    expect(await screen.findByText('Confirma tu correo para proteger tu cuenta.')).toBeInTheDocument()
    first.unmount()

    renderApp(`/verify-email?token=${demoToken(ctx.storage)}`, ctx.data, ctx.storage)
    expect(await screen.findByRole('heading', { name: 'Correo confirmado' })).toBeInTheDocument()
    expect(screen.getByText('Hemos confirmado rosa@ejemplo.com. Tu cuenta ya está protegida.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ir a mis rutas' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))
    await user.click(screen.getByRole('link', { name: 'Perfil' }))
    await waitFor(() => expect(location()).toBe('/profile'))
    expect(screen.getByText('rosa@ejemplo.com')).toBeInTheDocument()
    expect(screen.queryByText('Confirma tu correo para proteger tu cuenta.')).not.toBeInTheDocument()
  })

  it('an unknown or missing token shows the invalid state; an expired one offers to resend', async () => {
    const ctx = setup()
    const invalid = renderApp('/verify-email?token=demo-00000000', ctx.data, ctx.storage)
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
    invalid.unmount()

    const missing = renderApp('/verify-email', ctx.data, ctx.storage)
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeInTheDocument()
    missing.unmount()

    await ctx.data.register('pablo@ejemplo.com', 'una-clave-bien-larga')
    const expired: DataModule = {
      ...ctx.data,
      verifyEmail: () => Promise.reject(new ApiClientError('Caducado', 'TOKEN_EXPIRED', 410)),
    }
    renderApp('/verify-email?token=demo-12345678', expired, ctx.storage)
    expect(await screen.findByRole('heading', { name: 'El enlace ha caducado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar correo' })).toBeInTheDocument()
  })
})

describe('feature 4 · /auth/callback', () => {
  const account: Session = { kind: 'account', email: 'google@ejemplo.com', name: 'Google', emailVerified: true }

  it('finishes the provider sign-in and returns to the stored returnTo', async () => {
    const ctx = setup()
    let fragment = ''
    let signedIn = false
    window.sessionStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ returnTo: '/preferences' }))
    const data: DataModule = {
      ...ctx.data,
      getSession: async () => (signedIn ? account : { kind: 'guest' }),
      completeSignIn: async (hash) => {
        fragment = hash
        signedIn = true
        return account
      },
    }
    renderApp('/auth/callback#state=s&ticket=t', data, ctx.storage)
    await waitFor(() => expect(location()).toBe('/preferences'))
    expect(fragment).toBe('#state=s&ticket=t')
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBeNull()
  })

  it('ignores a returnTo that leaves the site', async () => {
    const ctx = setup()
    window.sessionStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ returnTo: '//evil.example.com/x' }))
    renderApp('/auth/callback#state=s&ticket=t', { ...ctx.data, completeSignIn: async () => account }, ctx.storage)
    await waitFor(() => expect(location()).toBe('/my-routes'))
  })

  it('a cancelled sign-in goes back to Entrar with a toast; other errors explain and offer to retry', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    const denied = renderApp(
      '/auth/callback#error=access_denied',
      { ...ctx.data, completeSignIn: () => Promise.reject(new ApiClientError('access_denied', 'ACCESS_DENIED', 400)) },
      ctx.storage,
    )
    await waitFor(() => expect(location()).toBe('/login'))
    expect(await screen.findByText('Has cancelado el acceso')).toBeInTheDocument()
    denied.unmount()

    renderApp(
      '/auth/callback#state=s&error=invalid_state',
      { ...ctx.data, completeSignIn: () => Promise.reject(new ApiClientError('invalid_state', 'INVALID_STATE', 400)) },
      ctx.storage,
    )
    expect(await screen.findByRole('heading', { name: 'No se ha podido entrar' })).toBeInTheDocument()
    expect(screen.getByText('El acceso ha caducado o no se empezó en este navegador. Vuelve a intentarlo.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Volver a intentarlo' }))
    await waitFor(() => expect(location()).toBe('/login'))
  })
})
