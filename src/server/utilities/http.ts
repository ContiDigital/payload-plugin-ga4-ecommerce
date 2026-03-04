import type { PayloadRequest } from 'payload'

export const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, { status })

export const errorResponse = (req: PayloadRequest, error: unknown): Response => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : 500

  const message =
    status >= 500
      ? 'Internal analytics error'
      : error instanceof Error
        ? error.message
        : 'Unexpected analytics error'

  if (status >= 500) {
    req.payload.logger.error({ error }, '[payload-ga4-analytics] request failed')
  } else {
    req.payload.logger.warn({ error }, '[payload-ga4-analytics] request rejected')
  }

  return jsonResponse(
    {
      error: message,
    },
    status,
  )
}
