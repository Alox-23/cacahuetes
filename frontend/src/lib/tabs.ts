import type { TabKey } from '../components/TabBar/TabBar'

const PROFILE_SECTIONS = ['/profile', '/preferences', '/account', '/login', '/register']

/** Maps every URL to the tab it belongs to, so the bar is always present and consistent. */
export function tabForPath(pathname: string): TabKey {
  if (pathname.startsWith('/my-routes')) return 'routes'
  if (PROFILE_SECTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'profile'
  return 'assistant'
}
