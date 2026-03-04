# Payload GA4 Ecommerce / Enterprise Analytics

Production-Grade Google Analytics 4 for Payload CMS v3

<!-- Insert a short looping GIF of your production analytics dashboard here -->

## Payload Analytics

Most analytics plugins are built as lightweight blog widgets. This plugin is designed for high-volume e-commerce and enterprise operations, bringing production-grade GA4 telemetry directly into Payload CMS admin workflows.

## Why This Is Production-Ready

- Zero-friction Next.js + Payload integration with typed endpoint mounting.
- Serverless resilience via retry/backoff, per-instance concurrency limiting, and bounded in-memory caching.
- Record-level telemetry injected into configured collections (products, categories, pages, etc.).
- Prioritized business event tracking (`purchase`, `add_to_cart`, `phone_call`, `submit_order`, and custom events).
- Secure-by-default endpoint access with explicit role-based override support.

## Production integration guide

### 1. Create GA4 + service account access

1. In Google Cloud, enable the **Google Analytics Data API**.
2. Create a service account.
3. Create JSON credentials for that service account.
4. In GA4 Property Access Management, grant the service account email at least read access to the property (Viewer/Analyst).
5. Capture your GA4 property ID (numeric value).

### 2. Add plugin package

```bash
pnpm add payload-plugin-ga4-ecommerce
```

### 3. Store credentials securely

Use your platform secret manager in production.

Required values:

- `GA4_PROPERTY_ID`
- Either:
  - `GA4_CREDENTIALS_JSON` (raw JSON string), or
  - `GA4_CREDENTIALS_PATH` (mounted file path)

### 4. Configure Payload plugin

Recommended production config:

```ts
import { buildConfig } from 'payload'
import payloadGa4AnalyticsPlugin from 'payload-ga4-analytics-plugin'

export default buildConfig({
  // ...your existing config
  plugins: [
    payloadGa4AnalyticsPlugin({
      propertyId: process.env.GA4_PROPERTY_ID!,
      getCredentials: async () => {
        if (process.env.GA4_CREDENTIALS_JSON) {
          return {
            credentials: JSON.parse(process.env.GA4_CREDENTIALS_JSON),
            type: 'json',
          }
        }

        if (process.env.GA4_CREDENTIALS_PATH) {
          return {
            path: process.env.GA4_CREDENTIALS_PATH,
            type: 'keyFilename',
          }
        }

        throw new Error('Missing GA4_CREDENTIALS_JSON or GA4_CREDENTIALS_PATH')
      },

      // Explicit access control is strongly recommended.
      access: ({ user }) => Boolean(user && user.role === 'admin'),

      // Route mode is best when you use role-based/custom dashboards.
      admin: {
        mode: 'route',
        navLabel: 'Analytics',
        route: '/analytics',
      },

      // Map collection docs to frontend pathnames for record analytics.
      collections: [
        {
          slug: 'products',
          getPathname: (doc) => `/products/${doc.slug}`,
        },
        {
          slug: 'categories',
          pathnameField: 'url',
        },
      ],

      // Event prioritization (displayed in route + record analytics views).
      events: {
        trackedEventNames: [
          'phone_call',
          'purchase',
          'product_inquiry',
          'add_to_cart',
          'begin_checkout_process',
          'submit_order',
        ],
        reportLimit: 10,
      },

      // Conservative serverless defaults (tune per traffic/quota).
      cache: {
        enabled: true,
        aggregateTtlMs: 60_000,
        timeseriesTtlMs: 60_000,
        maxEntries: 500,
      },
      rateLimit: {
        enabled: true,
        maxConcurrency: 2,
        maxRetries: 2,
        baseRetryDelayMs: 250,
        maxRetryDelayMs: 2_000,
        jitterFactor: 0.2,
        includePropertyQuota: true,
      },

      source: {
        dimension: 'sessionSource',
      },
    }),
  ],
})
```

### 5. Choose the admin integration mode correctly

- `route` (recommended): Adds a dedicated sidebar route for analytics.
  - Best choice when your app already has custom/role-based dashboards.
  - Avoids coupling analytics to dashboard composition rules.
- `dashboard`: Adds dashboard panel only.
- `both`: Route + dashboard panel.
- `headless`: API only, no admin UI additions.

For role-based dashboard systems, `route` is usually the cleanest and safest production mode.

### 6. Validate in your app

1. Start Payload.
2. Login as an allowed user.
3. Open admin analytics route (for example `/admin/analytics`).
4. Verify:
   - Aggregate metrics load.
   - Time-series chart loads.
   - Top pages/sources/events render.
   - Record pages in configured collections show analytics tab.

## Serverless behavior: in-memory cache and rate limiting

Critical behavior in Lambda/Vercel/serverless runtimes:

- Cache is **in-memory per runtime instance**, not shared globally.
- Cache is lost on cold starts.
- Different warm instances do not share cache entries.
- Concurrency limits and retries are also per instance.

Implications:

- Correctness is not harmed, but cache hit ratio is lower under horizontal scale.
- GA4 quota pressure can increase when many instances are warm simultaneously.

Recommendations for serverless deployments:

1. Keep `maxConcurrency` low (`1` or `2`).
2. Keep retries conservative (`maxRetries` `1-2`).
3. Use bounded cache (`maxEntries`) and short TTLs.
4. Restrict access to trusted admins only.
5. Monitor GA4 quota consumption after launch.

If you need globally shared cache semantics across instances, add an external cache layer (Redis/KV) in a future adapter.

## API endpoints

Default base path: `/api/analytics/ga4`

- `GET /health`
- `POST /global/aggregate`
- `POST /global/timeseries`
- `POST /page/aggregate`
- `POST /page/timeseries`
- `POST /report`
- `GET /metadata`
- `POST /compatibility`
- `GET /live`

## Security model

- Default behavior: deny anonymous requests.
- If `access` is omitted, authenticated `req.user` is required.
- You should still provide explicit role-based `access` in production.
- Internal server errors are sanitized in responses; details stay in server logs.

## Configuration options

```ts
type PayloadGA4AnalyticsPluginOptions = {
  propertyId: string
  getCredentials: GetCredentialsFn

  disabled?: boolean
  access?: AccessFn

  collections?: Array<{
    slug: string
    pathnameField?: string
    getPathname?: (doc: Record<string, unknown>) => string
  }>

  admin?: {
    mode?: 'route' | 'dashboard' | 'both' | 'headless'
    navLabel?: string
    route?: `/${string}`
  }

  api?: {
    basePath?: `/${string}`
  }

  cache?: {
    enabled?: boolean
    aggregateTtlMs?: number
    timeseriesTtlMs?: number
    maxEntries?: number
  }

  rateLimit?: {
    enabled?: boolean
    maxConcurrency?: number
    maxRetries?: number
    baseRetryDelayMs?: number
    maxRetryDelayMs?: number
    jitterFactor?: number
    includePropertyQuota?: boolean
  }

  source?: {
    dimension?: 'sessionSource' | 'firstUserSource' | 'source'
  }

  events?: {
    trackedEventNames?: string[]
    reportLimit?: number
  }
}
```

## Local development in this repository

```bash
pnpm install
cp dev/.env.example dev/.env
pnpm dev
```

Local admin credentials (seeded):

- `admin@example.com` / `admin`
- `developer@example.com` / `test`

If credentials changed in an old local DB, restart dev; seed now upserts known dev users.

Useful scripts:

- `pnpm lint`
- `pnpm test:int`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm pack:smoke`
- `pnpm release:check`

## CI/CD and release setup

This repo includes:

- `.github/workflows/ci.yml`
  - Runs on PRs and pushes to `main`, `master`, and `release/*`
  - Executes lint, tests, build, and package smoke install
  - Optional GA4 live smoke runs when GA4 secrets exist
- `.github/workflows/release.yml`
  - Runs on version tags matching `v*.*.*`
  - Verifies tag version matches `package.json`
  - Verifies tagged commit is contained in `main` or `master`
  - Re-runs full release gates
  - Publishes to npm
  - Creates GitHub Release notes

### Required GitHub secrets

For release publishing:

- `NPM_TOKEN`

For optional GA4 live smoke:

- `GA4_PROPERTY_ID`
- `GA4_CREDENTIALS_JSON`

### Recommended branch strategy

Recommended default for this package:

1. Use `main` as the release integration branch.
2. Require PR reviews + required checks (`CI / Quality Gates`) before merge.
3. Use `release/*` only as temporary stabilization branches when needed.
4. Tag releases from commits already merged to `main` (`v1.2.3`).

This is why release workflow verifies tagged commit membership in `main`/`master`.

### Release procedure

1. Ensure local gates pass:

```bash
pnpm release:check
```

2. Bump version and create tag:

```bash
npm version patch
```

3. Push commit + tag:

```bash
git push origin main --follow-tags
```

4. GitHub Actions `Release` workflow publishes automatically.

## Troubleshooting

- `403` on analytics endpoints: your `access` rule denied the request.
- `500` with GA4 issues: check server logs for GA4 compatibility/quota details.
- Empty event table on record pages: only non-zero events are shown by design.
- `test:e2e` fails locally: run `npx playwright install` once.

## License

MIT
