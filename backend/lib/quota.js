import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { ApiError } from './http.js';

const trialSeconds = 3 * 60 * 60;

export function visitorNetwork(request, localIp) {
  const secret = process.env.QUOTA_SECRET;
  if (!secret || secret.length < 32) throw new Error('QUOTA_SECRET requires at least 32 characters');
  const ip = process.env.VERCEL
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()
    : localIp;
  if (!ip || !isIP(ip)) throw new ApiError(503, 'NETWORK_UNAVAILABLE', 'No se ha podido iniciar la sesión temporal.');
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function rateLimit(db, subject, maximum, seconds = 60) {
  const { rows } = await db.query(`
    INSERT INTO rate_limits (subject, bucket, hits)
    VALUES ($1, floor(extract(epoch FROM now()) / $2::int)::bigint, 1)
    ON CONFLICT (subject) DO UPDATE
    SET bucket = EXCLUDED.bucket,
        hits = CASE WHEN rate_limits.bucket = EXCLUDED.bucket THEN rate_limits.hits + 1 ELSE 1 END
    WHERE rate_limits.bucket <> EXCLUDED.bucket OR rate_limits.hits < $3
    RETURNING hits
  `, [subject, seconds, maximum]);
  if (!rows.length) {
    throw new ApiError(429, 'RATE_LIMITED', 'Demasiadas peticiones. Vuelve a intentarlo en unos minutos.', {
      retryAfterSeconds: seconds
    });
  }
}

export function trialInfo(account, row = account) {
  const kind = !account ? 'guest' : account.plan;
  if (kind === 'premium') return { plan: kind, remainingSeconds: null, expiresAt: null };
  if (!row?.trial_started_at) return { plan: kind, remainingSeconds: trialSeconds, expiresAt: null };
  const expires = new Date(new Date(row.trial_started_at).getTime() + trialSeconds * 1_000);
  return {
    plan: kind,
    remainingSeconds: Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 1_000)),
    expiresAt: expires.toISOString()
  };
}

export async function authorizeAgent(db, account, networkKey) {
  const subject = account ? account.id : networkKey;
  await rateLimit(db, `agent:${subject}`, 20);
  let row;
  if (account) {
    ({ rows: [row] } = await db.query(`
      UPDATE accounts
      SET trial_started_at = CASE WHEN plan = 'free' THEN COALESCE(trial_started_at, now()) ELSE trial_started_at END
      WHERE id = $1 RETURNING plan, trial_started_at
    `, [account.id]));
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    account = { ...account, ...row };
  } else {
    ({ rows: [row] } = await db.query(`
      INSERT INTO guest_trials (network_key) VALUES ($1)
      ON CONFLICT (network_key) DO UPDATE SET started_at = guest_trials.started_at
      RETURNING started_at AS trial_started_at
    `, [networkKey]));
  }
  const quota = trialInfo(account, row);
  if (quota.remainingSeconds === 0) {
    throw new ApiError(403, 'AGENT_TIME_EXPIRED', 'Se han agotado las tres horas de acceso gratuito a Cacahuete.', {
      quota
    });
  }
  return quota;
}
