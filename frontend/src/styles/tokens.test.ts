import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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

  it('font families come from tokens.json', () => {
    expect(declared('font-heading')).toContain(tokens.font.heading)
    expect(declared('font-body')).toContain(tokens.font.body)
  })
})
