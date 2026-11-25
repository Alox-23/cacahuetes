// Password rules shared with frontend/src/lib/validation.ts (same order, same denylist file).
import common from './common-passwords.json' with { type: 'json' };

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;

const denylist = new Set(common.map((entry) => entry.toLowerCase()));

export const passwordMessages = {
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 12 caracteres.',
  PASSWORD_TOO_LONG: 'La contraseña no puede superar los 128 caracteres.',
  PASSWORD_TOO_SIMPLE: 'Usa al menos 4 caracteres distintos.',
  PASSWORD_CONTAINS_EMAIL: 'La contraseña no puede contener tu correo.',
  PASSWORD_COMMON: 'Esa contraseña es demasiado común. Elige otra.'
};

/** Returns null when the password is acceptable, otherwise the first failing reason code. */
export function validatePassword(password, email = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return 'PASSWORD_TOO_SHORT';
  if (password.length > MAX_PASSWORD) return 'PASSWORD_TOO_LONG';
  if (new Set(password).size < 4) return 'PASSWORD_TOO_SIMPLE';
  const lower = password.toLowerCase();
  const address = String(email).trim().toLowerCase();
  const local = address.split('@')[0] ?? '';
  if ((address && lower.includes(address)) || (local.length >= 4 && lower.includes(local))) {
    return 'PASSWORD_CONTAINS_EMAIL';
  }
  if (denylist.has(lower)) return 'PASSWORD_COMMON';
  return null;
}
