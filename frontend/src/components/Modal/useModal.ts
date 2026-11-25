import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open modals, innermost last: only the top one answers Escape and Tab (a dialog over the slide-over). */
const stack: object[] = []

/**
 * Shared modal behaviour (Dialog, ConfirmSheet, SlideOver): focus moves in,
 * Tab is trapped (unless `trap` is false), Escape closes, focus returns to the
 * opener, and the page behind does not scroll.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, { trap = true, lockScroll = true } = {}) {
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const token = {}
    stack.push(token)
    const opener = document.activeElement as HTMLElement | null
    const el = ref.current
    if (el) {
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el
      target.focus()
    }
    const previousOverflow = document.body.style.overflow
    if (lockScroll) document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      const node = ref.current
      if (!node || stack[stack.length - 1] !== token) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !trap) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      stack.splice(stack.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown)
      if (lockScroll) document.body.style.overflow = previousOverflow
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [ref, trap, lockScroll])
}
