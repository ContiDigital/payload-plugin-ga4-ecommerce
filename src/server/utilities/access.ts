import type { PayloadRequest } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'

export class AccessDeniedError extends Error {
  readonly status = 403

  constructor() {
    super('Access denied')
    this.name = 'AccessDeniedError'
  }
}

const hasAdminRole = (user: PayloadRequest['user']): boolean => {
  if (!user || typeof user !== 'object') {
    return false
  }

  if ('isAdmin' in user && user.isAdmin === true) {
    return true
  }

  if ('role' in user && typeof user.role === 'string') {
    return user.role.toLowerCase() === 'admin'
  }

  if ('roles' in user && Array.isArray(user.roles)) {
    return user.roles.some((role) => typeof role === 'string' && role.toLowerCase() === 'admin')
  }

  return false
}

export const assertAccess = async (
  req: PayloadRequest,
  options: NormalizedPluginOptions,
): Promise<void> => {
  if (!options.access) {
    if (hasAdminRole(req.user)) {
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
