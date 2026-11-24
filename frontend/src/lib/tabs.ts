import type { TabKey } from '../components/TabBar/TabBar'

/** Maps every URL to the tab it belongs to, so the bar is always present and consistent. */
export function tabForPath(pathname: string): TabKey {
  if (pathname.startsWith('/my-routes')) return 'routes'
  if (pathname.startsWith('/profile') || pathname.startsWith('/preferences') || pathname.startsWith('/login')) {
    return 'profile'
  }
  return 'assistant'
}
