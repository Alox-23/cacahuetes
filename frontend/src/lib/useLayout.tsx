/* eslint-disable react-refresh/only-export-components -- provider and hook live together */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BREAKPOINTS } from './breakpoints'

export type Layout = 'mobile' | 'tablet' | 'desktop'

const LayoutContext = createContext<Layout | null>(null)

/** Forces a layout for its subtree (tests, previews). */
export function LayoutProvider({ value, children }: { value: Layout; children: ReactNode }) {
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

function query(min: number): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(`(min-width: ${min}px)`)
}

function read(): Layout {
  if (query(BREAKPOINTS.desktop)?.matches) return 'desktop'
  if (query(BREAKPOINTS.tablet)?.matches) return 'tablet'
  return 'mobile'
}

/**
 * Which arrangement to render: 'desktop' from 1024 px, 'tablet' from 768 px
 * (still the mobile structure), 'mobile' below. Without matchMedia (jsdom) it
 * is 'mobile'. Structure is chosen in JS; widths stay in CSS.
 */
export function useLayout(): Layout {
  const forced = useContext(LayoutContext)
  const [layout, setLayout] = useState<Layout>(() => forced ?? read())

  useEffect(() => {
    if (forced) return
    const lists = [query(BREAKPOINTS.desktop), query(BREAKPOINTS.tablet)].filter((l): l is MediaQueryList => l !== null)
    const update = () => setLayout(read())
    update()
    for (const l of lists) l.addEventListener('change', update)
    return () => {
      for (const l of lists) l.removeEventListener('change', update)
    }
  }, [forced])

  return forced ?? layout
}

export const isDesktop = (layout: Layout) => layout === 'desktop'
