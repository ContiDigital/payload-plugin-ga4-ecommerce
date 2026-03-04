import type { PayloadRequest } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'

export class AccessDeniedError extends Error {
  readonly status = 403

  constructor() {
    super('Access denied')
    this.name = 'AccessDeniedError'
  }
}

export const assertAccess = async (
  req: PayloadRequest,
  options: NormalizedPluginOptions,
): Promise<void> => {
  if (!options.access) {
    if (req.user) {
      return
    }

    throw new AccessDeniedError()
  }

  const granted = await options.access({
    payload: req.payload,
    req,
    user: req.user,
  })

  if (!granted) {
    throw new AccessDeniedError()
  }
}
