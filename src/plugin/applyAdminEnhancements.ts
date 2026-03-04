import type { Config } from 'payload'

import type { NormalizedPluginOptions } from '../types/index.js'

import { PLUGIN_MODULE_ID } from '../constants.js'

type AdminComponents = NonNullable<NonNullable<Config['admin']>['components']>
type AdminView = NonNullable<AdminComponents['views']>[string]
type CustomComponentArray = NonNullable<AdminComponents['beforeDashboard']>
type DashboardComponent = NonNullable<AdminComponents['beforeDashboard']>[number]
type NavComponent = NonNullable<AdminComponents['beforeNavLinks']>[number]

const withUniqueComponent = (
  components: AdminComponents['beforeNavLinks'],
  component: NavComponent,
): NonNullable<AdminComponents['beforeNavLinks']> => {
  const next = [...(components ?? [])]

  const exists = next.some((candidate) => {
    if (candidate === false || component === false) {
      return false
    }

    if (typeof candidate === 'string' || typeof component === 'string') {
      return candidate === component
    }

    return candidate.path === component.path && candidate.exportName === component.exportName
  })

  if (!exists) {
    next.push(component)
  }

  return next
}

const withUniqueDashboardComponent = (
  components: CustomComponentArray | undefined,
  component: DashboardComponent,
): CustomComponentArray => {
  const next = [...(components ?? [])]

  const exists = next.some((candidate) => {
    if (candidate === false || component === false) {
      return false
    }

    if (typeof candidate === 'string' || typeof component === 'string') {
      return candidate === component
    }

    return candidate.path === component.path && candidate.exportName === component.exportName
  })

  if (!exists) {
    next.push(component)
  }

  return next
}

const normalizeRoutePrefix = (value: string): string => {
  if (value === '/') {
    return ''
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

const toAdminHref = (adminBasePath: string, routePath: string): string =>
  `${normalizeRoutePrefix(adminBasePath)}${routePath}`

export const applyAdminEnhancements = (
  config: Config,
  options: NormalizedPluginOptions,
): Config => {
  if (options.admin.mode === 'headless') {
    return config
  }

  const adminBasePath = config.routes?.admin ?? '/admin'
  const apiBasePath = config.routes?.api ?? '/api'

  const nextConfig: Config = {
    ...config,
    admin: {
      ...(config.admin ?? {}),
      components: {
        ...(config.admin?.components ?? {}),
      },
    },
  }

  if (options.admin.mode === 'route' || options.admin.mode === 'both') {
    const navLinkComponent = {
      clientProps: {
        href: toAdminHref(adminBasePath, options.admin.route),
        label: options.admin.navLabel,
      },
      exportName: 'AnalyticsNavLink',
      path: `${PLUGIN_MODULE_ID}/client`,
    } as NavComponent

    nextConfig.admin!.components!.beforeNavLinks = withUniqueComponent(
      nextConfig.admin!.components!.beforeNavLinks,
      navLinkComponent,
    )

    const analyticsView = {
      Component: {
        exportName: 'AnalyticsRouteView',
        path: `${PLUGIN_MODULE_ID}/rsc`,
        serverProps: {
          apiRoute: apiBasePath,
          endpointBasePath: options.api.basePath,
          title: options.admin.navLabel,
        },
      },
      path: options.admin.route,
    } as unknown as AdminView

    nextConfig.admin!.components!.views = {
      ...(nextConfig.admin!.components!.views ?? {}),
      ga4Analytics: {
        ...analyticsView,
      },
    }
  }

  if (options.admin.mode === 'dashboard' || options.admin.mode === 'both') {
    const dashboardComponent = {
      clientProps: {
        endpointBasePath: `${normalizeRoutePrefix(apiBasePath)}${options.api.basePath}`,
      },
      exportName: 'DashboardAnalyticsPanel',
      path: `${PLUGIN_MODULE_ID}/client`,
    } as DashboardComponent

    nextConfig.admin!.components!.beforeDashboard = withUniqueDashboardComponent(
      nextConfig.admin!.components!.beforeDashboard,
      dashboardComponent,
    )
  }

  return nextConfig
}
