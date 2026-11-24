export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message) => new ApiError(400, 'INVALID_INPUT', message);

export function object(value, name = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${name} debe ser un objeto.`);
  }
  return value;
}

export async function readText(request, maxBytes = 16_384) {
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new ApiError(413, 'BODY_TOO_LARGE', 'La petición pesa demasiado.');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let size = 0;
  let content = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, 'BODY_TOO_LARGE', 'La petición pesa demasiado.');
    }
    content += decoder.decode(value, { stream: true });
  }
  return content + decoder.decode();
}

export async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envía application/json.');
  }
  const content = await readText(request);
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw badRequest('El JSON no es válido.');
  }
  return object(value);
}

export function configuredOrigins() {
  return (process.env.FRONTEND_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
}

export function json(data, status, headers) {
  return Response.json(data, { status, headers });
}
