# payload-plugin-ga4-ecommerce

Production-grade Google Analytics 4 reporting for [Payload CMS](https://payloadcms.com) v3.

Originally built as a custom integration for [Fine's Gallery](https://finesgallery.com) — a high-traffic marble and stone ecommerce storefront running Payload CMS in production. Extracted and open-sourced as a standalone plugin for any Payload v3 project that needs real GA4 analytics inside the admin panel.

Ships a full GA4 Data API service layer with admin analytics UI, per-record collection analytics, tiered caching, bounded concurrency, retry with exponential backoff, in-flight request deduplication, and dual-layer rate limiting — all as a single Payload plugin.

Also fully compatible with the official [Payload Ecommerce Template](https://github.com/payloadcms/payload/tree/main/templates/ecommerce) — see [Ecommerce Template Setup](#ecommerce-template-setup) below.

## Production Demo

https://github.com/user-attachments/assets/bd7f2496-d319-45f5-b2c0-2e3ff2b4be6c

> Analytics dashboard and per-record analytics running on [Fine's Gallery](https://finesgallery.com) in production.

## Features

**Analytics dashboard** — dedicated admin route with KPI cards (views, visitors, sessions, bounce rate, engagement time), global timeseries chart, top pages, top traffic sources, top events, and live visitor count.

**Record-level analytics** — automatic "Analytics" tab injected into configured collections (products, categories, pages, blog posts, etc.) showing per-URL aggregate metrics, timeseries chart, period-over-period comparison with percentage deltas, and traffic source breakdown for that specific record.

**Business event tracking** — configure tracked event names (`purchase`, `add_to_cart`, `phone_call`, `begin_checkout_process`, `submit_order`, etc.) and get prioritized event reporting in the dashboard.

**Full GA4 Data API coverage** — `runReport`, `runRealtimeReport`, `getMetadata`, `checkCompatibility` — all exposed as typed Payload endpoints with full request validation.

**Tiered caching** — two strategies:
- `payloadCollection` — DB-backed cache with LRU eviction (default, zero infrastructure)
- `redis` — distributed cache for multi-node deployments with race-safe eviction

**Dual-layer rate limiting** — outbound bounded concurrency queue with in-flight request deduplication to protect GA4 API quotas; inbound per-IP, per-route sliding window to protect your endpoints from abuse.

**Retry with backoff** — exponential backoff + full jitter for transient GA4 failures (HTTP 429/500/502/503/504, gRPC RESOURCE_EXHAUSTED / UNAVAILABLE / DEADLINE_EXCEEDED). Configurable max retries and delay caps.

**GA4 quota visibility** — optional `includePropertyQuota` returns GA4 PropertyQuota data with responses so you can monitor token consumption.

## Installation

Requires Node `^18.20.2 || >=20.9.0` and Payload CMS `^3.37.0`.

```bash
pnpm add payload-plugin-ga4-ecommerce
```

Optional peer dependencies:

| Package | When required |
|---------|--------------|
| `recharts` | Admin analytics UI (charts) |
| `redis` | `cache.strategy: 'redis'` |

## Quick start

```ts
import { buildConfig } from 'payload'
import { payloadGa4AnalyticsPlugin } from 'payload-plugin-ga4-ecommerce'

export default buildConfig({
  plugins: [
    payloadGa4AnalyticsPlugin({
      propertyId: process.env.GA4_PROPERTY_ID!,
      getCredentials: async () => ({
        type: 'keyFilename',
        path: process.env.GA4_CREDENTIALS_PATH!,
      }),
      collections: [
        { slug: 'products', getPathname: (doc) => `/products/${doc.slug}` },
        { slug: 'pages', getPathname: (doc) => `/${doc.slug}` },
      ],
    }),
  ],
})
```

That's it. The plugin mounts 9 API endpoints, injects an Analytics sidebar route, and adds an Analytics tab to each configured collection.

Each collection entry needs either `pathnameField` (a field name containing the URL path) or `getPathname` (a function that builds the path from the document). The plugin uses this to query GA4 for that specific page's analytics.

### Ecommerce Template Setup

If you're using the official [Payload Ecommerce Template](https://github.com/payloadcms/payload/tree/main/templates/ecommerce), add the plugin **after** `ecommercePlugin()` in your plugins array (since `ecommercePlugin` creates the `products` collection):

```ts
// src/plugins/index.ts
export const plugins: Plugin[] = [
  seoPlugin({ /* ... */ }),
  formBuilderPlugin({ /* ... */ }),
  ecommercePlugin({ /* ... */ }),

  // Add after ecommercePlugin
  payloadGa4AnalyticsPlugin({
    propertyId: process.env.GA4_PROPERTY_ID!,
    getCredentials: async () => ({
      type: 'keyFilename',
      path: process.env.GA4_CREDENTIALS_PATH!,
    }),
    collections: [
      { slug: 'products', getPathname: (doc) => `/products/${doc.slug}` },
      { slug: 'pages', getPathname: (doc) => `/${doc.slug}` },
      { slug: 'categories', getPathname: (doc) => `/categories/${doc.slug}` },
    ],
  }),
]
```

The template's `products`, `pages`, and `categories` collections all use Payload's built-in `slugField()`, and Products and Pages already use a tabs layout — auto-injection works with zero additional configuration.

## Production ecommerce configuration

Full example for a production ecommerce storefront with Redis caching, role-based access, and business event tracking:

```ts
payloadGa4AnalyticsPlugin({
  propertyId: process.env.GA4_PROPERTY_ID!,

  getCredentials: async () => {
    // JSON string from secret manager (recommended for production)
    if (process.env.GA4_CREDENTIALS_JSON) {
      return {
        credentials: JSON.parse(process.env.GA4_CREDENTIALS_JSON),
        type: 'json',
      }
    }
    // File path fallback (Docker volumes, local dev)
    return {
      path: process.env.GA4_CREDENTIALS_PATH!,
      type: 'keyFilename',
    }
  },

  // Disable gracefully when credentials aren't available (CI, tests)
  disabled: !process.env.GA4_PROPERTY_ID,

  // Role-based access — admin and SEO roles only
  access: ({ user }) =>
    Boolean(user && user.roles?.some((r: string) => ['admin', 'seo'].includes(r))),

  admin: {
    mode: 'route',       // sidebar route, not dashboard injection
    navLabel: 'Analytics',
    route: '/analytics',
  },

  // Map collections to their public URL paths for per-record analytics
  collections: [
    { slug: 'products', getPathname: (doc) => `/products/${doc.slug}` },
    { slug: 'categories', getPathname: (doc) => `/categories/${doc.slug}` },
    { slug: 'pages', getPathname: (doc) => `/${doc.slug}` },
    { slug: 'blog', getPathname: (doc) => `/blog/${doc.slug}` },
  ],

  // Track ecommerce + lead-gen events
  events: {
    trackedEventNames: [
      'purchase',
      'add_to_cart',
      'begin_checkout_process',
      'submit_order',
      'phone_call',
      'product_inquiry',
    ],
    reportLimit: 10,
  },

  // Redis cache for multi-node deployment
  cache: {
    enabled: true,
    strategy: 'redis',
    redis: { url: process.env.REDIS_URL!, keyPrefix: 'ga4' },
    aggregateTtlMs: 5 * 60_000,    // 5 minutes
    timeseriesTtlMs: 5 * 60_000,
    maxEntries: 2_000,
  },

  // Conservative rate limiting for production
  rateLimit: {
    enabled: true,
    maxConcurrency: 2,              // 2 concurrent GA4 calls per node
    maxQueueSize: 100,
    maxRequestsPerMinute: 120,      // per IP per route
    maxRetries: 3,
    baseRetryDelayMs: 250,
    maxRetryDelayMs: 4_000,
    jitterFactor: 0.2,
    requestTimeoutMs: 10_000,
    includePropertyQuota: true,
  },

  source: { dimension: 'sessionSource' },
})
```

## GA4 setup

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Analytics Data API**.
2. Create a service account and generate a JSON key file.
3. In [GA4 Admin > Property Access Management](https://analytics.google.com/), grant the service account **Viewer** access.
4. Note your numeric GA4 property ID (GA4 Admin > Property Settings).

| Environment variable | Required | Description |
|---------------------|----------|-------------|
| `GA4_PROPERTY_ID` | Yes | Numeric GA4 property ID |
| `GA4_CREDENTIALS_JSON` | One of these | Raw JSON string of service account key |
| `GA4_CREDENTIALS_PATH` | One of these | File path to service account JSON key |

## Admin integration modes

| Mode | Behavior |
|------|----------|
| `route` (default) | Dedicated sidebar route at `/admin/analytics` |
| `dashboard` | Panel injected into the admin dashboard |
| `both` | Sidebar route + dashboard panel |
| `headless` | Endpoints only, no admin UI |

**`route` is recommended** for production apps with role-based custom dashboards (sales, warehouse, accounting, etc.) since it avoids layout conflicts.

## Record-level analytics

When `collections` is configured, the plugin injects an "Analytics" tab into each collection's edit view showing:

- Aggregate KPIs for that record's URL (views, visitors, session duration)
- Timeseries chart (views + visitors over time)
- Period-over-period comparison with percentage deltas
- Top traffic sources for that specific page

### Manual UI placement (optional)

By default (`autoInjectUI: true`), the plugin appends an "Analytics" tab to the **end** of your collection's existing tabs — or appends a root field if no tabs exist. Most projects should use this and skip this section entirely.

If you need the analytics panel in a **specific tab position** (e.g. second tab instead of last) or with a **custom label**, set `autoInjectUI: false` and place `AnalyticsUIPlaceholder` exactly where you want it:

```ts
import {
  AnalyticsUIPlaceholder,
  payloadGa4AnalyticsPlugin,
} from 'payload-plugin-ga4-ecommerce'

// In plugin config:
payloadGa4AnalyticsPlugin({ autoInjectUI: false, /* ... */ })

// In a collection's field layout — analytics as the second tab with a custom label:
fields: [
  {
    type: 'tabs',
    tabs: [
      { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
      { label: 'Insights', fields: [AnalyticsUIPlaceholder] },
      { label: 'SEO', fields: [/* ... */] },
      { label: 'Settings', fields: [/* ... */] },
    ],
  },
]
```

At config build time, the plugin replaces the placeholder with the fully hydrated analytics field. The placeholder itself never renders.

`getAnalyticsField()` and `getAnalyticsTab()` are also exported for programmatic construction when you need even more control.

## API endpoints

Base path: `/api/analytics/ga4` (configurable via `api.basePath`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Plugin status and configuration snapshot |
| `POST` | `/global/aggregate` | Site-wide KPI metrics for a timeframe |
| `POST` | `/global/timeseries` | Site-wide metrics over time |
| `POST` | `/page/aggregate` | Per-URL KPI metrics for a timeframe |
| `POST` | `/page/timeseries` | Per-URL metrics over time |
| `POST` | `/report` | Property breakdown (page, country, device, source, event) |
| `GET` | `/metadata` | Available GA4 dimensions and metrics |
| `POST` | `/compatibility` | Check metric/dimension compatibility |
| `GET` | `/live` | Real-time active visitor count |

### Available metrics

`views` `visitors` `sessions` `sessionDuration` `bounceRate` `eventCount`

### Available timeframes

`7d` `30d` `6mo` `12mo` `currentMonth`

### Available report properties

`page` `country` `device` `source` `event`

### Example requests

```bash
# Site-wide KPIs with period comparison
curl -X POST http://localhost:3000/api/analytics/ga4/global/aggregate \
  -H 'Content-Type: application/json' \
  -d '{"timeframe":"30d","metrics":["views","visitors","sessions","bounceRate"],"comparePrevious":true}'

# Per-product analytics
curl -X POST http://localhost:3000/api/analytics/ga4/page/aggregate \
  -H 'Content-Type: application/json' \
  -d '{"pagePath":"/products/marble-fireplace-mantel","timeframe":"30d","comparePrevious":true}'

# Traffic sources for a specific page
curl -X POST http://localhost:3000/api/analytics/ga4/report \
  -H 'Content-Type: application/json' \
  -d '{"property":"source","pagePath":"/products/marble-fireplace-mantel","timeframe":"30d"}'

# Live visitors
curl http://localhost:3000/api/analytics/ga4/live
```

## Cache strategies

### `payloadCollection` (default)

Uses a hidden Payload collection as cache storage. Shared across all app instances on the same database. LRU eviction via `accessedAt` timestamps with expired entry cleanup every 30 seconds. No additional infrastructure.

### `redis`

Distributed LRU cache using Redis sorted sets. Atomic eviction, race-safe for multi-node duplicate deletes. Requires `cache.redis.url` and the `redis` npm package installed in your project. Recommended for horizontally scaled deployments.

```bash
pnpm add redis
```

```ts
cache: {
  enabled: true,
  strategy: 'redis',
  redis: { url: 'redis://localhost:6379', keyPrefix: 'ga4' },
  aggregateTtlMs: 5 * 60_000,
  timeseriesTtlMs: 5 * 60_000,
  maxEntries: 2_000,
}
```

## Rate limiting

### Outbound (GA4 API protection)

Bounded concurrency queue (`maxConcurrency` default: 4). In-flight request deduplication — identical concurrent queries share one GA4 API call. Retry with exponential backoff + full jitter on transient failures. Queue overflow returns HTTP 429.

### Inbound (endpoint abuse protection)

Per-route, per-client sliding window (60 seconds). Client IP resolved from `x-forwarded-for` / `x-real-ip` headers. Falls back to shared bucket without proxy headers.

**Security note:** IP resolution relies on a trusted reverse proxy. Deploy behind nginx, Cloudflare, or your cloud provider's load balancer.

### Serverless environments

Both layers are per-node / per-process. In serverless (Vercel, AWS Lambda):

- Limits are not globally coordinated across invocations.
- Use `redis` cache strategy for cross-invocation consistency.
- Conservative settings recommended: `maxConcurrency: 1`, `maxRetries: 1`, strict `access` policy.

## Security

- Anonymous requests denied (HTTP 403).
- Default access: admin-only. Override with `access` option.
- Inbound rate limiting on all endpoints (HTTP 429 on abuse).
- Input validation on all endpoints (metrics, timeframes, paths, content types).
- Error responses sanitized; full details to server logs only.

## Lifecycle

The plugin registers `SIGINT`, `SIGTERM`, and `beforeExit` hooks to gracefully destroy GA4 clients, Redis connections, and limiter state.

`createAnalyticsService()` is exported for custom runtime integration and exposes `destroy()`.

## Configuration reference

```ts
type PayloadGA4AnalyticsPluginOptions = {
  /** Numeric GA4 property ID (required) */
  propertyId: string

  /** Async credential provider (required) */
  getCredentials: (args: {
    payload: null | Payload
    req?: PayloadRequest
  }) => Promise<
    | { credentials: { client_email: string; private_key: string; project_id?: string }; type: 'json' }
    | { path: string; type: 'keyFilename' }
  >

  /** Disable the plugin without removing it (default: false) */
  disabled?: boolean

  /** Custom access control (default: admin-only) */
  access?: (args: {
    payload: Payload; req: PayloadRequest; user: PayloadRequest['user']
  }) => boolean | Promise<boolean>

  /** Auto-inject Analytics tab into collections (default: true) */
  autoInjectUI?: boolean

  /** Collections with per-record analytics */
  collections?: Array<{
    slug: string
    pathnameField?: string
    getPathname?: (doc: Record<string, unknown>) => string
  }>

  admin?: {
    mode?: 'route' | 'dashboard' | 'both' | 'headless'  // default: 'route'
    navLabel?: string                                     // default: 'Analytics'
    route?: `/${string}`                                  // default: '/analytics'
  }

  api?: {
    basePath?: `/${string}`  // default: '/analytics/ga4'
  }

  cache?: {
    enabled?: boolean                            // default: true
    strategy?: 'payloadCollection' | 'redis'     // default: 'payloadCollection'
    collectionSlug?: string                      // default: 'ga4-cache-entries'
    redis?: { url: string; keyPrefix?: string }
    aggregateTtlMs?: number                      // default: 300000 (5 min)
    timeseriesTtlMs?: number                     // default: 300000 (5 min)
    maxEntries?: number                          // default: 1000
  }

  rateLimit?: {
    enabled?: boolean              // default: true
    maxConcurrency?: number        // default: 4
    maxQueueSize?: number          // default: 100
    maxRequestsPerMinute?: number  // default: 120
    maxRetries?: number            // default: 3
    baseRetryDelayMs?: number      // default: 250
    maxRetryDelayMs?: number       // default: 4000
    jitterFactor?: number          // default: 0.2
    requestTimeoutMs?: number      // default: 10000
    includePropertyQuota?: boolean // default: true
  }

  events?: {
    trackedEventNames?: string[]  // default: []
    reportLimit?: number          // default: 10
  }

  source?: {
    dimension?: 'sessionSource' | 'firstUserSource' | 'source'  // default: 'sessionSource'
  }
}
```

## Local development

```bash
git clone https://github.com/ContiDigital/payload-plugin-ga4-ecommerce.git
cd payload-plugin-ga4-ecommerce
pnpm install
cp dev/.env.example dev/.env
# Set GA4_PROPERTY_ID and GA4_CREDENTIALS_PATH in dev/.env
pnpm dev
```

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server with Turbopack |
| `pnpm lint` | ESLint (zero-warning policy) |
| `pnpm test:int` | Unit + integration tests |
| `pnpm test:coverage` | Tests with v8 coverage |
| `pnpm build` | Type declarations + SWC compilation |
| `pnpm pack:smoke` | Package + install verification |
| `pnpm release:check` | Full pre-release gate |

## CI/CD

**CI** (PR + push to main): lint, tests, coverage, build, pack smoke — matrix tested on Node 18 + 20. Optional GA4 live smoke test when secrets are configured.

**Release** (on `v*.*.*` tags): verifies tag/version alignment and main branch membership, runs full quality gates, publishes to npm with provenance, creates GitHub release.

### GitHub secrets

| Secret | Required for | Description |
|--------|-------------|-------------|
| `GA4_PROPERTY_ID` | CI (optional) | GA4 property for live smoke tests |
| `GA4_CREDENTIALS_JSON` | CI (optional) | Service account JSON for live smoke tests |
| `NPM_TOKEN` | Release | npm publish token |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
