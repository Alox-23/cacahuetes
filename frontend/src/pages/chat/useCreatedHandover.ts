import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreation, type ThreadItem } from '../../state/AppState'

/**
 * Feature 5 §5.3 (mobile): when the latest reply says the agent created a route, open the Creando screen
 * (Peanut Run) while the provider plays the four steps; it then opens the route as after "Crear ruta".
 * Once per reply, and only while that creation is still running (not when coming back to the chat later).
 */
export function useCreatedHandover(messages: ThreadItem[]) {
  const navigate = useNavigate()
  const { creation } = useCreation()
  const handled = useRef<string | null>(null)
  const last = messages[messages.length - 1] as ThreadItem | undefined
  const created = last?.kind === 'assistant' ? last.reply.display?.created : undefined
  const lastId = last?.id
  const running = creation?.status === 'running' && created !== undefined && creation.route?.id === created.id

  useEffect(() => {
    if (!running || !lastId || handled.current === lastId) return
    handled.current = lastId
    navigate('/creating')
  }, [running, lastId, navigate])
}
