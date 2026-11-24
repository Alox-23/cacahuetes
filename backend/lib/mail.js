import { ApiError, configuredOrigins } from './http.js';

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

/** Verification only applies when real mail is on, or locally (the link is printed in the console). */
export const verificationActive = () => mailConfigured() || !process.env.VERCEL;

/** Public URL of the web app, used to build links in emails and OAuth redirects (never from client input). */
export function appUrl() {
  const url = process.env.APP_URL ?? configuredOrigins()[0];
  if (!url) throw new ApiError(503, 'MAIL_UNAVAILABLE', 'El correo todavía no está disponible.');
  return url.replace(/\/+$/, '');
}

/** Sends through the Resend REST API; without credentials it prints the message to the console. */
export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    console.log(`[mail] ${subject} → ${to}\n${text}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new ApiError(502, 'MAIL_FAILED', 'No se ha podido enviar el correo. Inténtalo más tarde.');
}
