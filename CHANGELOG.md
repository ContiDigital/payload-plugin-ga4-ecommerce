# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

## [1.1.0] - 2026-05-10

### Added

- Return normalized GA4 `propertyQuota` data on analytics report responses when `includePropertyQuota` is enabled. New exported types `PropertyQuota` and `PropertyQuotaStatus`; new optional `propertyQuota` field on `AggregateResult`, `TimeseriesResult`, `ReportResult`, and `LiveResult`.
- Add `POST /api/analytics/ga4/cache/clear` to clear the configured analytics cache through the existing access control and inbound rate-limit pipeline. New exported type `CacheClearResult`.
- Add `landingPage` report support backed by GA4 `landingPagePlusQueryString`, with default `sessions` and `visitors` metrics.
- Add admin UI refresh controls that can bypass cached analytics data for one request cycle without clearing persisted cache entries.
- Declare `@payloadcms/next`, `@payloadcms/ui`, `react`, and `react-dom` as optional peer dependencies so headless-mode consumers are not required to install them.

### Fixed

- Preserve packaged CSS by marking CSS files as side effects in `package.json` (prevents bundlers from tree-shaking the admin UI stylesheet).
- Keep `cache.enabled: false` fully inert: skip Redis URL validation and skip hidden `ga4-cache-entries` collection injection.
- Prevent delimiter collisions in analytics cache keys by switching the key encoding from `parts.join('|')` to `JSON.stringify(parts)`.
- Tolerate unique-key races in `PayloadCollectionCacheService.set` by falling back to update-on-existing when a concurrent writer wins the create.
- Reject queued outbound limiter work during shutdown with `RateLimiterDestroyedError` instead of leaving promises pending forever.
- Format GA4 fractional rate metrics (notably `bounceRate`) as percentages in the admin UI. Bounce rate now renders as `27.61%` instead of `0.28%`, and bounce rate deltas render as percentage points (`+10.0 pts`).

### Notes

- **Cache invalidation on upgrade**: the cache key encoding change (above) means existing cached entries written by 1.0.x will not match keys produced by 1.1.0. Entries expire normally via TTL (5 min default for aggregates and timeseries). Expect one cold cache window after deploy; no manual action required.
- Expanded test coverage for cache races, GA4 rate formatting, and rate limiter shutdown semantics.
