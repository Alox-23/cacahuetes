import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS } from '../lib/breakpoints'

const root = resolve(__dirname, '../..')
const tokens = JSON.parse(readFileSync(resolve(root, 'docs/design/tokens.json'), 'utf8'))
const css = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8')

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function declared(name: string): string | undefined {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return m?.[1].trim()
}

describe('design tokens', () => {
  it('every color in tokens.json is a CSS variable with the same value', () => {
    for (const [key, value] of Object.entries<string>(tokens.color)) {
      expect(declared(`color-${kebab(key)}`)?.toUpperCase(), key).toBe(value.toUpperCase())
    }
  })

  it('every color value appears in tokens.css', () => {
    for (const value of Object.values<string>(tokens.color)) {
      expect(css.toUpperCase()).toContain(value.toUpperCase())
    }
  })

  it('font sizes, radii, spacing and sizes match (px)', () => {
    const groups: [string, Record<string, number>][] = [
      ['font-size', tokens.font.size],
      ['radius', tokens.radius],
      ['space', tokens.space],
      ['size', tokens.size],
    ]
    for (const [prefix, group] of groups) {
      for (const [key, value] of Object.entries(group)) {
        expect(declared(`${prefix}-${kebab(key)}`), `${prefix}.${key}`).toBe(`${value}px`)
      }
    }
  })

  it('desktop group: every width is a --desktop-* variable (px)', () => {
    const d = tokens.desktop
    const expected: Record<string, number> = {
      'desktop-sidebar-width': d.sidebarWidth,
      'desktop-chat-min': d.chatColumn.min,
      'desktop-chat-max': d.chatColumn.max,
      'desktop-chat-wide-max': d.chatWideMax,
      'desktop-reading-max': d.readingMax,
      'desktop-dialog-width': d.dialogWidth,
      'desktop-chat-header-height': d.chatHeaderHeight,
      'desktop-max-content': d.breakpoint.maxContent,
    }
    for (const [name, value] of Object.entries(expected)) {
      expect(declared(name), name).toBe(`${value}px`)
    }
  })

  it('desktop breakpoints are the documented constants', () => {
    expect(BREAKPOINTS.tablet).toBe(tokens.desktop.breakpoint.tablet)
    expect(BREAKPOINTS.desktop).toBe(tokens.desktop.breakpoint.desktop)
    expect(BREAKPOINTS.maxContent).toBe(tokens.desktop.breakpoint.maxContent)
    // Media queries repeat them literally.
    const global = readFileSync(resolve(root, 'src/styles/global.css'), 'utf8')
    expect(global).toContain(`(min-width: ${tokens.desktop.breakpoint.tablet}px)`)
  })

  it('chatBubble group: every value is a --chat-bubble-* variable', () => {
    const squash = (s: string | undefined) => s?.replace(/\s+/g, '').toUpperCase()
    for (const [key, value] of Object.entries<string | number>(tokens.chatBubble)) {
      const expected = typeof value === 'number' ? `${value}px` : value
      expect(squash(declared(`chat-bubble-${kebab(key)}`)), key).toBe(squash(expected))
    }
  })

  it('font families come from tokens.json', () => {
    expect(declared('font-heading')).toContain(tokens.font.heading)
    expect(declared('font-body')).toContain(tokens.font.body)
  })
})
