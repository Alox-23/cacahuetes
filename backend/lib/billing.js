import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError, configuredOrigins, readText } from './http.js';

const purpose = 'cacahuete_premium';

export async function startCheckout(db, account) {
  const { STRIPE_SECRET_KEY: secret, STRIPE_PRICE_ID: price, STRIPE_WEBHOOK_SECRET: webhookSecret } = process.env;
  const returnOrigin = configuredOrigins()[0];
  if (!secret || !price || !webhookSecret || !returnOrigin) {
    throw new ApiError(503, 'BILLING_UNAVAILABLE', 'El pago todavía no está disponible.');
  }
  if (account.plan === 'premium') throw new ApiError(409, 'ALREADY_PREMIUM', 'Esta cuenta ya es Premium.');

  // Concurrent requests reuse the same Stripe checkout for this account.
  const { rows: [intent] } = await db.query(`
    INSERT INTO billing_intents (account_id, id) VALUES ($1, $2)
    ON CONFLICT (account_id) DO UPDATE SET
      id = CASE WHEN billing_intents.started_at <= now() - interval '24 hours'
        THEN EXCLUDED.id ELSE billing_intents.id END,
      started_at = CASE WHEN billing_intents.started_at <= now() - interval '24 hours'
        THEN now() ELSE billing_intents.started_at END
    RETURNING id
  `, [account.id, randomUUID()]);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': intent.id
    },
    body: new URLSearchParams({
      mode: 'payment',
      customer_email: account.email,
      success_url: `${returnOrigin}/?checkout=success`,
      cancel_url: `${returnOrigin}/?checkout=cancelled`,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      'metadata[purpose]': purpose,
      'metadata[accountId]': account.id
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new ApiError(502, 'CHECKOUT_FAILED', 'No se ha podido iniciar el pago.');
  const checkout = await response.json();
  if (typeof checkout.url !== 'string' || !checkout.url.startsWith('https://')) {
    throw new ApiError(502, 'CHECKOUT_FAILED', 'No se ha podido iniciar el pago.');
  }
  return { checkoutUrl: checkout.url };
}

function validSignature(header, contents, secret) {
  const parts = (header ?? '').split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!/^\d{1,16}$/.test(timestamp ?? '') || Math.abs(Date.now() / 1_000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${contents}`).digest();
  return parts.some(([key, signature]) =>
    key === 'v1' && /^[a-f\d]{64}$/i.test(signature ?? '') &&
    timingSafeEqual(Buffer.from(signature, 'hex'), expected));
}

export async function stripeWebhook(db, request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, 'BILLING_UNAVAILABLE', 'El pago todavía no está disponible.');
  const raw = await readText(request, 128_000);
  if (!validSignature(request.headers.get('stripe-signature'), raw, secret)) {
    throw new ApiError(400, 'INVALID_SIGNATURE', 'Firma de Stripe no válida.');
  }
  const event = JSON.parse(raw);
  const checkout = event.data?.object;
  const expectedType = event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded';
  if (expectedType && checkout?.mode === 'payment' && checkout.payment_status === 'paid' &&
    checkout.metadata?.purpose === purpose && /^cs_[a-z\d_]+$/i.test(checkout.id ?? '') &&
    /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(checkout.metadata.accountId ?? '')) {
    await db.query(`
      WITH payment AS (
        INSERT INTO premium_payments (checkout_id, account_id)
        SELECT $1, id FROM accounts WHERE id = $2
        ON CONFLICT (checkout_id) DO NOTHING RETURNING account_id
      )
      UPDATE accounts SET plan = 'premium'
      WHERE id = (SELECT account_id FROM payment)
    `, [checkout.id, checkout.metadata.accountId]);
  }
  return { received: true };
}
