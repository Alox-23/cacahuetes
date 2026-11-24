import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Back in history when the app has one, otherwise to the parent URL. */
export function useBack(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, location.key, fallback])
}
