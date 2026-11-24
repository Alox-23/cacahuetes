import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError, badRequest } from './http.js';

const derive = promisify(scrypt);
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const unusedSalt = 'cacahuete-login-timing-v1';

function credentials(body, registering) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Introduce un correo electrónico válido.');
  }
  const password = body.password;
  if (typeof password !== 'string' || password.length < (registering ? 12 : 1) || password.length > 128) {
    throw badRequest(registering ? 'La contraseña debe tener entre 12 y 128 caracteres.' : 'Introduce la contraseña.');
  }
  return { email, password };
}

export function publicAccount(account) {
  return { id: account.id, email: account.email, plan: account.plan, profile: account.profile };
}

function sessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

export async function register(db, body) {
  const { email, password } = credentials(body, true);
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  const passwordHash = `${salt}:${key.toString('hex')}`;
  const session = sessionToken();
  const { rows: [account] } = await db.query(`
    WITH account AS (
      INSERT INTO accounts (id, email, password_hash) VALUES ($1, $2, $3)
      ON CONFLICT (email) DO NOTHING RETURNING *
    ), session AS (
      INSERT INTO sessions (token_hash, account_id, expires_at)
      SELECT $4, id, now() + interval '30 days' FROM account
    )
    SELECT id, email, plan, profile, trial_started_at FROM account
  `, [randomUUID(), email, passwordHash, session.hash]);
  if (!account) throw new ApiError(409, 'EMAIL_EXISTS', 'Ya existe una cuenta con este correo.');
  return { account, token: session.token };
}

export async function login(db, body) {
  const { email, password } = credentials(body, false);
  const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE email = $1', [email]);
  const [salt, expected] = account?.password_hash.split(':') ?? [unusedSalt, '0'.repeat(128)];
  const actual = await derive(password, salt, 64);
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !account) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  }
  const session = sessionToken();
  await db.query(`
    INSERT INTO sessions (token_hash, account_id, expires_at)
    VALUES ($1, $2, now() + interval '30 days')
  `, [session.hash, account.id]);
  return { account, token: session.token };
}

export async function authenticate(db, request, required = false) {
  const authorization = request.headers.get('authorization');
  if (!authorization && !required) return null;
  const token = authorization?.match(/^Bearer ([a-zA-Z0-9_-]{43})$/i)?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  const hash = tokenHash(token);
  const { rows: [account] } = await db.query(`
    SELECT a.id, a.email, a.plan, a.profile, a.trial_started_at
    FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
  `, [hash]);
  if (!account) throw new ApiError(401, 'UNAUTHENTICATED', 'Tu sesión ya no es válida.');
  return { ...account, sessionHash: hash };
}

export async function saveProfile(db, account, profile) {
  await db.query('UPDATE accounts SET profile = $2::jsonb WHERE id = $1', [account.id, JSON.stringify(profile)]);
}
