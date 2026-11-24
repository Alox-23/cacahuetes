import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from './http.js';
import { appUrl, sendMail } from './mail.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const escapeHtml = (value) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Replaces the account's pending links with a new one (24 h, single use) and emails it. */
export async function issueVerification(db, account) {
  const link = new URL('/verify-email', `${appUrl()}/`);
  const token = randomBytes(32).toString('base64url');
  link.searchParams.set('token', token);
  await db.query(`
    WITH previous AS (DELETE FROM email_verifications WHERE account_id = $2)
    INSERT INTO email_verifications (token_hash, account_id, email, expires_at)
    VALUES ($1, $2, $3, now() + interval '24 hours')
  `, [hash(token), account.id, account.email]);
  const href = link.toString();
  await sendMail({
    to: account.email,
    subject: 'Confirma tu correo en Cacahuete',
    text: [
      'Hola:',
      '',
      'Abre este enlace para confirmar tu correo en Cacahuete:',
      href,
      '',
      'El enlace caduca en 24 horas. Si no has creado una cuenta en Cacahuete, ignora este mensaje.'
    ].join('\n'),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#2b2118">
<h1 style="font-size:20px">Confirma tu correo</h1>
<p>Pulsa el botón para confirmar tu correo en Cacahuete.</p>
<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#c4622d;color:#fff;text-decoration:none;font-weight:600">Confirmar correo</a></p>
<p style="font-size:13px;color:#6b5d52">Si el botón no funciona, copia este enlace: ${escapeHtml(href)}</p>
<p style="font-size:13px;color:#6b5d52">El enlace caduca en 24 horas. Si no has creado una cuenta en Cacahuete, ignora este mensaje.</p>
</div>`
  });
}

/** Consumes a verification link and marks the address as confirmed. */
export async function verifyEmail(db, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new ApiError(400, 'INVALID_TOKEN', 'Este enlace no es válido.');
  }
  const { rows: [row] } = await db.query(`
    DELETE FROM email_verifications WHERE token_hash = $1
    RETURNING account_id, email, expires_at > now() AS fresh
  `, [hash(token)]);
  if (!row) throw new ApiError(400, 'INVALID_TOKEN', 'Este enlace no es válido.');
  if (!row.fresh) throw new ApiError(410, 'TOKEN_EXPIRED', 'Este enlace ha caducado. Pide uno nuevo desde la app.');
  await db.query(`
    UPDATE accounts SET email_verified_at = coalesce(email_verified_at, now())
    WHERE id = $1 AND email = $2
  `, [row.account_id, row.email]);
  return { email: row.email, verified: true };
}
