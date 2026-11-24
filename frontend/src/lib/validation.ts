/** Client-side checks for the account forms; the same rules as backend/lib/password.js. */
import common from './common-passwords.json'

export const MIN_PASSWORD = 12
export const MAX_PASSWORD = 128

export type PasswordReason =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_SIMPLE'
  | 'PASSWORD_CONTAINS_EMAIL'
  | 'PASSWORD_COMMON'

const denylist = new Set(common.map((entry) => entry.toLowerCase()))

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Sign-in only needs a password to be typed. */
export function hasPassword(password: string): boolean {
  return password.length > 0
}

/** First unmet registration rule (same order as the server), or null when the password is acceptable. */
export function passwordProblem(password: string, email: string): PasswordReason | null {
  if (password.length < MIN_PASSWORD) return 'PASSWORD_TOO_SHORT'
  if (password.length > MAX_PASSWORD) return 'PASSWORD_TOO_LONG'
  if (new Set(password).size < 4) return 'PASSWORD_TOO_SIMPLE'
  const lower = password.toLowerCase()
  const address = email.trim().toLowerCase()
  const local = address.split('@')[0] ?? ''
  if ((address && lower.includes(address)) || (local.length >= 4 && lower.includes(local))) return 'PASSWORD_CONTAINS_EMAIL'
  if (denylist.has(lower)) return 'PASSWORD_COMMON'
  return null
}
