/* Crear cuenta (Registro.html) and Entrar (Login.html): mobile screen around the shared form (features/account). */
import { useLocation, useNavigate } from 'react-router-dom'
import { Header, Screen } from '../../components'
import { AuthForm as AuthFields, type AuthMode, type AuthState } from '../../features/account/AuthForm'
import { t } from '../../i18n'
import { useBack } from '../../lib/useBack'
import layout from '../layout.module.css'

export type { AuthState } from '../../features/account/AuthForm'

export function AuthForm({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as AuthState) ?? null
  const back = useBack('/')
  const register = mode === 'register'

  return (
    <Screen fixed className={layout.page}>
      <AuthFields
        key={mode}
        mode={mode}
        state={state}
        onSwitch={() => navigate(register ? '/login' : '/register', { state, replace: true })}
        top={
          <>
            <Header onBack={back} label={register ? t('auth.registerHeader') : t('auth.loginHeader')} className={layout.header} />
            <div className={layout.titleBlock}>
              <h1 className={layout.h1}>{register ? t('auth.registerTitle') : t('auth.loginTitle')}</h1>
              <p className={layout.subtitle}>{register ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</p>
            </div>
            <div className={layout.spacer} />
          </>
        }
      />
    </Screen>
  )
}
