import es from './es.json'

type Dict = typeof es

/** Dot-separated path to every string leaf of es.json, e.g. "chat.title". */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type TranslationKey = Leaves<Dict>
export type TranslationParams = Record<string, string | number>

function lookup(key: string): string | undefined {
  let node: unknown = es
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Translate a key from es.json. Missing keys return the key itself (visible in dev). */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const value = lookup(key)
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  return interpolate(value, params)
}

/** For keys built at runtime (e.g. `options.interests.${value}`). */
export function tDynamic(key: string, params?: TranslationParams): string {
  const value = lookup(key)
  return value === undefined ? key : interpolate(value, params)
}

/** Hook form, so components can be switched to a reactive locale later. */
export function useT() {
  return t
}
