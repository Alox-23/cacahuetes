/** Structured error from a data module: the server's (or the mock's) code, HTTP status and extra fields. */
export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(message: string, code: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiClientError =>
  error instanceof ApiClientError && (code === undefined || error.code === code)
