/*
 * One conversation thread for the whole app (feature 3 §4.3). Every item
 * carries the assistant mode it belongs to and that mode's epoch (bumped by
 * startChat). Mobile screens show one mode's live epoch; the desktop dock
 * shows the whole thread, with older items as read-only history.
 */
import type { RichReply, AssistantMode } from '../assistant/types'
import type { RouteRequest } from '../contract/types'

export const THREAD_LIMIT = 200

/** Epoch of items restored from storage: never equal to a live epoch. */
export const DEAD_EPOCH = -1

export type CreationStatus = 'running' | 'done' | 'failed' | 'cancelled'

export type NoticeQuick = {
  label: string
  /** "send": the label is sent as text to the mode; "new-request": start a fresh request at /chat. */
  action: 'send' | 'new-request'
}

type Base = {
  id: string
  mode: AssistantMode
  epoch: number
  /** Only rendered by the desktop dock (progress, "Crear ruta" echo, "La tienes a la derecha"…). */
  desktopOnly?: boolean
}

export type ThreadItem =
  | (Base & { kind: 'user'; text: string })
  | (Base & { kind: 'assistant'; reply: RichReply; chosen?: string })
  | (Base & { kind: 'progress'; request: RouteRequest; status: CreationStatus; routeId?: string })
  | (Base & { kind: 'notice'; text: string[]; hint?: string; quick?: NoticeQuick[] })

export type Epochs = Record<AssistantMode, number>

/** Items of one mode's live epoch that a mobile screen shows (feature 1 behaviour). */
export function modeView(thread: ThreadItem[], mode: AssistantMode, epoch: number): ThreadItem[] {
  return thread.filter((i) => i.mode === mode && i.epoch === epoch && !i.desktopOnly)
}

/** Keep the newest `limit` items. */
export function capThread(thread: ThreadItem[], limit = THREAD_LIMIT): ThreadItem[] {
  return thread.length > limit ? thread.slice(thread.length - limit) : thread
}

/** Items read back from storage become history: dead epoch, no running progress. */
export function restoreThread(raw: unknown): ThreadItem[] {
  if (!Array.isArray(raw)) return []
  return capThread(
    raw
      .filter((i): i is ThreadItem => Boolean(i) && typeof i === 'object' && typeof (i as ThreadItem).id === 'string' && typeof (i as ThreadItem).kind === 'string')
      .map((i) => ({
        ...i,
        epoch: DEAD_EPOCH,
        ...(i.kind === 'progress' && i.status === 'running' ? { status: 'cancelled' as const } : {}),
      })),
  )
}

/** Record which option answered the latest assistant item of a mode's live epoch. */
export function markChosen(thread: ThreadItem[], mode: AssistantMode, epoch: number, option: string | undefined): ThreadItem[] {
  if (!option) return thread
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i]
    if (item.mode === mode && item.epoch === epoch && item.kind === 'assistant') {
      const next = thread.slice()
      next[i] = { ...item, chosen: option }
      return next
    }
  }
  return thread
}

/** The latest assistant item of a mode's live epoch (the only one with live controls). */
export function liveAssistant(thread: ThreadItem[], mode: AssistantMode, epoch: number): ThreadItem | undefined {
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i]
    if (item.mode === mode && item.epoch === epoch && item.kind === 'assistant') return item
  }
  return undefined
}
