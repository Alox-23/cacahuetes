/* Share a route without backend: Web Share API when present, clipboard otherwise. */
import type { Route } from '../contract/types'
import { formatDateShort } from '../assistant/format'
import { t } from '../i18n'
import { routeTimeRange } from './routeText'

export type ShareResult = 'shared' | 'copied' | 'failed' | 'cancelled'

/** Plain-text summary: name, date and window, numbered stops with times. */
export function buildShareText(route: Route): string {
  return [
    route.name,
    t('share.when', { date: formatDateShort(route.request.date), time: routeTimeRange(route) }),
    '',
    ...route.stops.map((s) => t('share.stop', { order: s.order, time: s.arrive, name: s.name })),
    '',
    t('share.footer', { app: t('app.name') }),
  ].join('\n')
}

type ShareNavigator = {
  share?: (data: { title?: string; text?: string }) => Promise<void>
  clipboard?: { writeText(text: string): Promise<void> }
}

/** Last-resort copy through a hidden textarea (browsers that refuse the async clipboard). */
export function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/** navigator.share → "shared"; else clipboard → "copied"; dismissing the share sheet → "cancelled". */
export async function shareRoute(
  route: Route,
  nav: ShareNavigator | undefined = globalThis.navigator,
  copyFallback: (text: string) => boolean = legacyCopy,
): Promise<ShareResult> {
  const text = buildShareText(route)
  if (nav?.share) {
    try {
      await nav.share({ title: route.name, text })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // Fall through to the clipboard.
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text)
      return 'copied'
    } catch {
      // Fall through to the legacy copy.
    }
  }
  return copyFallback(text) ? 'copied' : 'failed'
}

/** Toast message key for a share outcome (none when the user dismissed the share sheet). */
export function shareToastKey(result: ShareResult): 'toast.shared' | 'toast.copied' | 'toast.shareFailed' | null {
  switch (result) {
    case 'shared':
      return 'toast.shared'
    case 'copied':
      return 'toast.copied'
    case 'failed':
      return 'toast.shareFailed'
    case 'cancelled':
      return null
  }
}
