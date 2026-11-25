import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreation, type ThreadItem } from '../../state/AppState'

/**
 * Feature 5 §5.3 (mobile): when the latest reply says the agent created a route, open the Creando screen
 * (Peanut Run) while the provider plays the four steps; it then opens the route as after "Crear ruta".
 * Once per creation, and only while it is running and not yet handed over: coming back to the chat later,
 * or with the browser's Back during the steps, does not push /creating again.
 */
export function useCreatedHandover(messages: ThreadItem[]) {
  const navigate = useNavigate()
  const { creation, markHandedOver } = useCreation()
  // StrictMode runs a mount effect twice before the state update lands; the ref keeps it to one push.
  const handled = useRef<string | null>(null)
  const last = messages[messages.length - 1] as ThreadItem | undefined
  const createdId = last?.kind === 'assistant' ? last.reply.display?.createdRouteId : undefined
  const target =
    creation?.status === 'running' && !creation.handedOver && createdId !== undefined && creation.route?.id === createdId
      ? creation.id
      : null

  useEffect(() => {
    if (!target || handled.current === target) return
    handled.current = target
    markHandedOver(target)
    navigate('/creating')
  }, [target, markHandedOver, navigate])
}
