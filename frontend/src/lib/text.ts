import { t } from '../i18n'

/** Lowercase, strip accents and collapse punctuation/whitespace, for fuzzy matching. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, ' ')
    .trim()
}

/** True when `phrase` appears in `text` as whole words (both normalized first). */
export function containsPhrase(text: string, phrase: string): boolean {
  const hay = ` ${normalize(text)} `
  const needle = normalize(phrase)
  return needle.length > 0 && hay.includes(` ${needle} `)
}

/** Position of the first whole-word match, or -1. */
export function phraseIndex(text: string, phrase: string): number {
  const hay = ` ${normalize(text)} `
  const needle = normalize(phrase)
  if (!needle) return -1
  return hay.indexOf(` ${needle} `)
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1)
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('es') + text.slice(1)
}

/** "a", "a y b", "a, b y c" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  const and = t('common.listAnd')
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}
