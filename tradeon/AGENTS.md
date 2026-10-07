# NexaTrade — Base44 development notes

## Stack
Next.js 15 (App Router) · React 19 · Three.js / react-three-fiber · Framer Motion ·
PostgreSQL via `pg` (cloud) or embedded PGlite (local fallback) · JWT in httpOnly cookies.

## Running here
```
docker compose -f docker-compose.base44.yml up -d --build
```
The active preview is `v2-client` on host 3000, backed by `v2-api` on 3101
and `v2-redis`. Legacy `web` remains on 3100 for reference. V2 needs
`DATABASE_URL` pointing to the existing PostgreSQL schema; only legacy `web`
has the embedded **PGlite** fallback when that variable is absent. Keep
`NODE_ENV=development` for both source-watch servers.

## What boots without credentials
- Crypto market data streams from Binance's public WebSocket (no API key).
- Auth works in dev via a fallback JWT secret, but a real `JWT_SECRET` is generated
  as a development placeholder and delivered via `/run/base44/app.env`.
- The admin portal (`/nexa-admin-portal/login`, email `arjumankhan181@gmail.com`)
  falls back to password `AdminPassword123!` in dev when `SUPER_ADMIN_PASSWORD` is unset.

## Secrets (external, user-supplied)
`JWT_SECRET` is the only boot-required secret (generated as a dev placeholder).
Optional external integrations: `DATABASE_URL`, `FINNHUB_API_KEY`, `POLYGON_API_KEY`,
`NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `SUPER_ADMIN_PASSWORD`. All delivered
through `/run/base44/app.env` (outside the repo).

## Dev loop
- Source is bind-mounted; Next.js HMR applies frontend edits live.
- `node_modules` and `.next` are anonymous volumes. Compose runs `npm ci`
  against the mounted lockfile before each server startup; restart the service
  after dependency changes. The dev cache persists independently.
- `npm run dev` runs `predev` → `scripts/build-info.mjs` which regenerates
  `src/lib/buildInfo.js` (consumed by `/api/health`) before Next starts.

## Dashboard runtime identity
- `/dashboard` renders `src/app/dashboard/page.jsx` → `components/dashboard/ChartArea.jsx`
  → `components/dashboard/TradeChart.jsx` → `components/chart/TradingChart.jsx`.
- `components/terminal/NexaTradeTerminal.jsx` belongs only to `/terminal`; editing
  its `CandleChart` or `AssetPicker` does not change the authenticated dashboard.
- After a server restart, verify the actual `/dashboard` browser preview (including
  loaded scripts), not only HTTP endpoints. A fresh preview reload was necessary
  after old dashboard scripts failed to load. The dashboard bundle uses `no-store`.
- Do not run `next build` against the running dev server's `.next` directory.
  For missing chunks, stop the server before clearing only the generated cache.
- Set current-price and trade-entry `markLine.precision: -1`. ECharts defaults
  to 2dp and rounds even an explicit `yAxis` value: forex lines drift or are
  clipped, and PEPE/SHIB round to zero and vanish. Badge text alone is rounded.
  `tests/currentPriceRendering.test.mjs` checks actual rendered line/badge geometry
  and the countdown gap for all 187 instruments, including intermediate display-price frames.
  Countdown X uses `lib/chart/priceBadgeLayout.js` to measure the native blue badge
  bounds, not assumed padding. Use the fractional CSS container width (ECharts
  rounds its width); the visible countdown-to-price gap is 48px.
  Dashboard trade price lines use native `markLine`; vertical time lines and
  white-ring endpoint dots use a native Cartesian `CustomChart` series. Labels
  stay on the left, outside the countdown/badge lane. No trade DOM overlays.
- Disable animation explicitly on the current-price **markLine** itself.
  Its default marker tween can lag behind the candle/DOM countdown even when
  the global option and candlestick series have `animation: false`.
- History prepends merge the existing live tail (`mergeBackfillRows`); the live
  buffer cap is 2000, matching the dashboard cap, not the old 500-row cap.
  Abort outstanding backfill requests on a market/timeframe switch.
- OTC Volume is hidden for all categories (Stocks included): true exchange
  volume is unavailable. Do not infer support from the asset category alone.
- The live chart must keep a stable Y price-to-pixel mapping between ordinary
  ticks (`lib/chart/followScale.js`); centring every new quote freezes the price
  line visually and moves historical candles instead. User zoom/resize refits Y.
- `lib/chart/viewport.js` preserves the visible bar count on appends and anchors
  a panned window to timestamps when the 500-row buffer shifts. Do not dispatch
  a redundant `dataZoom` after full chart renders: it fires the user-zoom handler.
- Reselecting the current timeframe must be a no-op. Clearing history without
  changing the interval disables the feed with no history effect to reopen it.
- Candle regression checks: `node --test tests/followScale.test.mjs
  tests/chartViewport.test.mjs tests/displayPrice.test.mjs
  tests/chartInternals.test.mjs tests/chartOption.test.mjs
  tests/timeframeSwitch.test.mjs` inside the web container.

## Health & verification
- `curl http://localhost:3000/api/health` → JSON with `status`, `db.status`, build,
  feed status. Returns 200 even when the DB is still initialising.
- The OTC pricing engine starts in `src/instrumentation.js` (`register()`); it is
  wrapped in try/catch and never blocks server startup. Disable with
  `OTC_ENGINE_ENABLED=false` if it causes noise.

## OTC-only market catalogue (final model)
- The user-facing trading catalogue is **OTC-ONLY**. Real/public market data
  remains internal reference/anchor material for the OTC engine, but every
  product a user can select and trade is an OTC instrument. There are NO
  real-market rows in the market drawer — `loadAssets` in
  `src/app/dashboard/page.jsx` sets assets to `fetchOtcAssets()` only.
- The curated registry lives in `src/lib/otc/instruments.js` (`OTC_INSTRUMENTS`):
  110 CRYPTO, 75 STOCK, 83 CURRENCY (FOREX incl. Gold/USD), 47 COMMODITY,
  46 INDEX = 361 instruments. `logicalCategory` drives the drawer tabs.
  Verify the actual `/dashboard` drawer by clicking every category and comparing
  all `[data-symbol]` rows with `/api/market/otc/assets`; registry counts alone
  do not verify the client. `tests/otcCatalog.test.mjs` checks every bundled icon.
- The curated registry has **361 instruments** (duplicate `JNJ-OTC` removed from
  `expandedInstruments.js`). Categories: 110 CRYPTO, 75 STOCK, 83 FOREX,
  47 COMMODITY, 46 INDEX. Verify with `/api/market/otc/assets`.
- **Infinite candle history** (`src/lib/otc/synthHistory.js`): when the DB runs
  out of persisted candles, `getOtcCandles` and `getOtcCandlesBefore` (in
  `src/lib/otc/service.js`) generate deterministic synthetic candles using the
  same PRNG as the engine. Backward mean reversion (sign flipped) keeps prices
  near `starting_price`; soft clamp at ±25% prevents drift. `hasMore` is always
  true so the user can scroll left indefinitely.
- **Market list virtual scrolling** (`MarketList.jsx`): render the viewport plus
  eight overscan rows on either side instead of all 361. `marketListWindow.js`
  owns the exact 46px row height, shared with CSS. Capture the scroll element
  before rAF: React clears `event.currentTarget` after the event. Ignore zero
  height while the drawer is hidden. Unused WebSocket and
  edge-quote subscriptions were removed (price was computed but never displayed).
- **Instant OTC asset switching**: `loadCandles` in `page.jsx` sets
  `historyLoaded=true` immediately for OTC so the SSE stream renders the forming
  candle without waiting for the HTTP history response (~650ms switch time).
- Drawer tabs: ALL · Crypto · Stocks · Currency · Indices · Commodities.
  All six are visible in a three-column, two-row grid with actual category counts
  (not a horizontally clipped strip). `FOREX` is
  relabelled "Currency" via `CATEGORY_LABELS` in `src/lib/assetCatalog.js`;
  the tab order is set in `src/components/dashboard/MarketList.jsx`. There is
  NO separate OTC tab because everything offered is already OTC.
- Asset icon system: `src/components/dashboard/AssetIcon.jsx` resolves icons
  for OTC symbols by stripping the `-OTC` suffix and using the instrument's
  `base`/`quote` fields (passed through `toAssetView`). Crypto → coin PNG from
  `/market-icons/coin-{base}.png`; Stocks → `instrument-{TICKER}.png`;
  FOREX → two overlapping flag images. Currency flags mapped via
  `src/lib/currencyFlags.js` (PNG for existing flags, SVG for th/id/cn/dk/pl).
  Fallback: professional monogram badge, never a broken-image glyph.
- `listOtcAssets` (service.js) filters DB rows to those present in the in-memory
  registry, so stale DB instruments removed from the curated catalogue (e.g. an
  old NVDA-OTC) can never leak into the user drawer. Admin still sees every row
  via `loadOtcInstruments({ activeOnly: false })`.
- `toAssetView` prefers the in-memory seed `displayName` (canonical) and
  `ensureOtcInstruments` syncs `display_name` on conflict, so the canonical
  "Bitcoin (OTC)" / "EUR/USD (OTC)" names show without a DB migration.
- The default selected symbol is `BTCUSD-OTC` (was `BTCUSDT`).
- The OTC engine, SSE stream, candle logic, trade entry (`marketType='OTC'`),
  and settlement are unchanged — only the catalogue/model and drawer wiring
  changed.
- OTC tick cadence is 500ms (up from 1000ms). The `ensureOtcInstruments` store
  function now updates `tick_interval_ms` on conflict (not just DO NOTHING).
- OTC market status badge shows "OTC Engine" (not "LIVE" or "PRICE STALE") for
  healthy instruments. The floating live-badge/pulse-dot was removed entirely.
- Price-line sync: the canonical price for OTC uses `livePrice` (from the tick)
  first, then falls back to `liveCandle.close` — both come from the same SSE
  tick message, so header == candle close == price line == badge.
- Focused tests: `tests/otcUnified.test.mjs` (24 tests covering logical
  category, dedup, OHLC, candle boundary, price-line equality, determinism,
  no data leak, tick cadence).
- Professional price line (Part 1.6): the current-price markLine is opaque WHITE
  dashed (`#ffffff`, width 2) with a BLUE badge (`#2583ff` bg, `#ffffff`
  text) centred on the right Y-axis (`position: end`, distance 0). Never use
  insideEndTop/Bottom or a vertical countdown offset: those displace labels
  from the actual close. The right gutter reserves the formatted price width. The candle countdown overlay is a WHITE/light
  badge (`rgba(255,255,255,0.92)` bg, dark text) positioned LEFT of the blue
  price badge with 48px of visible edge-to-edge clearance, at the same Y as
  the price line. All three (candle
  close, price line, badge, countdown Y) derive from ONE `displayPrice` via
  `buildLivePatch` — they cannot disagree by construction.
- OTC pipeline tests: `tests/otcPipeline.test.mjs` (40 tests covering symbol
  mapping, tick emission for every instrument, sequence increase, stale-symbol
  rejection, candle close == line == badge, reference feed loss resilience,
  candle boundary, markLine white/blue visual contract).

## Quirks
- **`next build` requires `NODE_ENV=production`.** The dev container sets
  `NODE_ENV=development` (needed for the PGlite fallback at runtime), but
  `next build` with `NODE_ENV=development` fails during static prerendering of
  the default Pages Router `/404` and `/_error` pages with
  `<Html> should not be imported outside of pages/_document` (Next.js issue
  #56481 — the dev runtime doesn't set up `HtmlContext` for those pages).
  The `build` script in `package.json` prefixes `NODE_ENV=production` so the
  build always succeeds regardless of the container's env. Do NOT remove that
  prefix. On Vercel/Render `NODE_ENV=production` is already the default.
- `next.config.mjs` `allowedDevOrigins` includes both `3000-` and `3100-`
  `${BASE44_PUBLIC_HOST_SUFFIX}` so the V2 preview and the legacy web (now on
  host port 3100) both permit HMR/dev-asset requests.
- `src/middleware.js` sets `frame-ancestors *` only on non-production hosts so the
  preview iframe can embed the app; real deployments keep `SAMEORIGIN`.
- The `markets` and `assets` catalogues are seeded on boot (version-gated by
  `system_settings.asset_catalog_version`) and admin edits are never overwritten.

## NexaTrade V2 migration (platform-v2/)
- Module-by-module migration to Vite + React + Zustand (client) and Node.js +
  TypeScript Express/Socket.io (server) lives in `platform-v2/`. The legacy
  Next.js app at the repo root (and the `legacy-backup` branch) stays untouched
  and bootable until the user explicitly declares the new system complete.
- Compose services: `v2-client` (Vite dev, host 3000 → 5173, proxies `/api`
  and `/socket.io` to v2-api) and `v2-api` (tsx watch, host 3101 → 4000).
  The legacy `web` service moved to host port 3100. The Base44 preview (port 3000)
  now serves the V2 client by default.
- Both v2 services run `npm ci` on startup against `platform-v2/*/package-lock.json`;
  node_modules are anonymous volumes, source is bind-mounted. Restart the service
  after dependency changes.
- `VITE_PROXY_TARGET=http://v2-api:4000` and the bare
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` entry must stay in v2-client's env.
- Module 1 (skeleton) verified: REST `/api/health`, Vite proxy, and Socket.io
  `tick:demo` delivery through the client proxy. Every further module needs the
  user's explicit approval first.
- TimescaleDB was approved (Option A) and applied: full pg_dump backup in
  sandbox `/backups/`, `CREATE EXTENSION timescaledb` + new empty hypertable
  `public.v2_candles` (timestamptz `time` column, PK symbol+timeframe+time).
  Existing tables were NOT modified. Migration SQL:
  `platform-v2/server/migrations/0001_timescaledb_v2_candles.sql`.
- The user's stored `DATABASE_URL` arrives wrapped in double quotes —
  `src/config/db.ts` and `src/lib/auth.ts` strip them before use.
- pg_dump/pg_restore against the Neon server (PostgreSQL 18) needs the
  `postgres:18` image; `postgres:16` aborts on version mismatch.
- v2-api also runs against the production Neon DB (health does `SELECT 1`).
  E2E auth tests ran against a THROWAWAY local postgres with a schema-only
  restore (`?sslmode=disable` on the URL) — never against production data.
- Auth module (ported from legacy): `POST /api/auth/register|login|logout`,
  `GET /api/auth/me`, jose HS256 JWT in the httpOnly `nexa_session` cookie
  (7 days, `tv` token_version revocation check), bcryptjs passwords, zod v4
  validation with identical messages, TOTP-aware login. In Express the body is
  already consumed by `express.json` — a manual `readJson` stream reader hangs
  forever; use `req.body` directly.
- Destructive DB queries remain forbidden without approval; security_logs /
  device_fingerprints / notifications inserts are the ported runtime
  behaviour, not schema changes.

## Market drawer repairs (2026-10-05)
- Every one of the 361 OTC assets has local artwork; expanded stocks/crypto
  use company/coin marks, currencies use flags, indices use regional flag +
  chart artwork, commodities use underlying-commodity illustrations. Sources
  are recorded in `public/market-icons/README.md`. Do not alias WAVES to
  Wormhole (W) or AirSwap (AST) to Astar (ASTR).
- Stocks need a light icon backing: some official marks (e.g. AMD) are black
  on transparent. `MarketArtwork` supplies a fallback on image load failure.
- Memoize the drawer selection callback; hidden drawers do not animate payouts.
- Trade annotations live in `lib/chart/tradeMarkers.js`: exact-price full-width
  `markLine`s plus native Cartesian vertical lines and white-ring endpoint dots.
  Fractional times interpolate native `api.coord`/`api.size`; ordinal `markPoint`
  rounds sub-candle indices, so never snap trades or insert times into candle axes.
  Marker-only updates cannot rebuild candles, change zoom or refit the price scale.
  Pending click coordinates persist in sessionStorage by idempotency key through
  confirmation/remount/reload; recorded trade execution values are never mutated.
  Open exit dots are hollow expiry projections at entry price; settled dots use
  recorded exit price. Off-screen coordinates are clipped, never clamped into view.
  Dashboard supplies open trades plus its existing eight recent closed trades.
  Verify `tests/nativeTradeMarkers.test.mjs`, `tests/tradeSegments.test.mjs`, and
  `tests/currentPriceRendering.test.mjs`. SVG scene tests must refresh the native
  display list (`getDisplayList(true)`); otherwise SSR retains stale removed nodes.
- Commodity SVG artwork is text-free (ingots, ore, battery, steel, etc.), without
  a white outer mask; commodity URLs include `?v=2` because old art is cached
  immutable. All 47 mappings are verified by `tests/otcCatalog.test.mjs`.
- `realtimeTransport.js` shares one authenticated control SSE per scope across
  shell/pages. Never open duplicate control streams: browser connection slots
  can starve normal wallet/session/trade requests. User/admin scopes stay separate.
- Engine persistence now batches all candle rolls and 361 checkpoints instead
  of writing each symbol separately. `drainTickQueue` is single-flight and
  restores failed batches; checkpoint SQL rejects older sequences, candle SQL
  cannot overwrite finalized OHLC. Restart the dev server after runner edits:
  the global singleton's existing timer otherwise retains its old closure.
- Dashboard reconciles trades by ID and selected account, ignoring pre-placement
  reads. Never cache balances/trade responses across sessions for speed.
- Focused checks: `node --test tests/realtimeTransport.test.mjs
  tests/tradeList.test.mjs tests/tradeSegments.test.mjs
  tests/otcBatchPersistence.test.mjs tests/otcCatalog.test.mjs`.
  Full suite still contains older failing assertions about expiry presets,
  indicator count, the removed LIVE badge, old thin-price-line styling, and
  contradictory exact-boundary countdown expectations; do not alter live
  trading behaviour just to satisfy those obsolete assertions.
- Workspace warmup reads the public OTC catalogue alongside session loading and
  prefetches the terminal/wallet route when idle. Only this public catalogue has
  a 15s browser memory cache; asset events invalidate it and force a fresh read.
  Balances, session, trades and wallet responses remain uncached.
- Wallet GET includes `rails` from the same shared payment-method read model as
  `/api/payments/methods`. The wallet page needs only `/api/wallet`; never fetch
  payment methods twice during bootstrap. History SQL returns `has_proof` rather
  than selecting megabytes of `proof_image` that the history never displays.
- All market artwork URLs use `marketIconUrl` (currently `?v=3`) to bypass old
  immutable images. Hidden/overscan drawer icons are lazy; selected asset icons
  are eager, all decode asynchronously. Verify every category by scrolling the
  actual drawer, not only checking registry/file existence.
- Loading regressions: `node --test tests/workspacePerformance.test.mjs
  tests/walletFlow.test.mjs tests/otcCatalog.test.mjs`.
- Dashboard navigation uses `WorkspaceLink` / `WorkspaceContent`: preloads the
  ten existing client-page modules, then switches within the authenticated shell
  using Next-compatible native history. `useWorkspacePathname` is a synchronous
  external store (including popstate); do not wait for Next's deferred transition
  to paint the workspace. Direct loads/other routes still use Next middleware.
  Never keep hidden pages mounted: their feeds, polling and camera must stop.
  Warmup is gated on the real session; wallet, trades and security are not cached.
- `apiCache` deduplicates cold/warm reads and revalidates after elapsed TTL, not a
  fraction of the epoch expiry. Refresh preserves visible data. Session identity
  changes/logout clear private snapshots and detach old requests; mutations must
  update their snapshots so remounts do not revert confirmed changes.
  Checks: `node --test tests/apiCache.test.mjs tests/workspaceNavigation.test.mjs
  tests/workspacePerformance.test.mjs` inside the web container.
- OTC subscribers must remain callable across module reloads: the global engine
  timer retains its old `notify` closure. Callable entries with `symbols` and
  `cb` metadata work with both `sub(tick)` and `sub.cb(tick)`; object-only entries
  silently stopped all live SSE ticks after HMR. Verify actual `tick` delivery,
  not only snapshots. Backpressure must coalesce one pending tick per symbol
  and flush it on `pull`; dropping a synchronous burst starves later symbols.
  Finalized-candle delivery uses the latest candle timestamp, never array length
  (the ring caps at 20), and advances only after enqueue.
  Regression: `node --test tests/otcStreamDelivery.test.mjs`.
- Older-candle SQL must bind `[symbol, timeframe, before, limit]` in that order.
  The previous limit/cursor inversion made older-history requests expensive
  and returned no earlier candles. Verify `tests/otcHistoryPagination.test.mjs`,
  `tests/marketListWindow.test.mjs`, and `tests/otcCatalog.test.mjs`.
- `/dashboard` trade feedback stays in the ticket/chart: no placement, settlement,
  rejection or zero-balance trade popup. Wallet notifications and unrelated
  safety/session alerts retain their existing channels. `TradeActionButton`
  gives a 260ms coloured inset pulse without disabling both buttons during HTTP.
  The existing 450ms server double-click limit is also checked locally; do not
  replace it with a network-duration lock. Pending rows say `Confirming…` and
  use the request's idempotency key as a stable React/chart key; confirmed events
  carry that same key. `mergeTradeList` removes only the matching pending row and
  cannot regress a settled result to OPEN. Backend price, debit and settlement
  rules remain authoritative. Regressions: `tests/tradePlacement.test.mjs` and
  `tests/tradeList.test.mjs`.

## Admin parity audit (2026-10-05)
- The legacy sidebar has 11 modules; the missing pieces were controller wiring,
  not additional top-level pages. `routes/adminPortal.ts` now mounts direct
  copies of the Next portal controllers in `src/admin/routes/*.js`. Do not
  reinstate the superseded `adminExtra.ts` or the snake_case/SQLite-style portal
  handlers: the actual legacy database and UI use camelCase read models and
  PATCH mutations (singular `/api/admin/affiliate`).
- `src/admin/http.ts` only adapts Express transport: `req.json()` reads the
  parsed body; request-local authentication uses `nexa_admin` and the live
  RBAC matrix. `src/admin/db.ts` uses the existing V2 pool with row-locking
  transactions. It never bootstraps, seeds or changes the shared schema.
- Legacy finance/KYC/affiliate approval logic must be kept intact: AUTO
  deposits cannot be manually credited, withdrawals debit on approval,
  rejected affiliate payouts refund affiliate_balance (not balance_real),
  and reviewed requests reject repeats. Production financial mutations must
  not be exercised for tests; use disposable local PostgreSQL fixtures.
- Admin cookies use Express milliseconds, not Next cookie seconds; a 1-day
  JWT needs `maxAge = 86400000`, not 86400. Sidebar permissions come from
  `/api/admin/me`, never a fabricated all-permissions list.
- The existing admin activity chart's `/api/market/candles` read and provider
  parsers are ported under `src/admin/lib/`; they do not replace the V2 trade
  engine. OTC edit requests map camelCase form values to the existing OTC
  controller's snake_case fields; OTC pricing/settlement logic is unchanged.
- Verified: server `npm run typecheck`; 57 HTTP/DB checks on a disposable
  PostgreSQL instance (role/owner guards, CRUD, atomic finance, KYC private
  image reads, affiliates, tournaments and tiers); 14 authenticated portal
  reads in the browser. Login and Markets category/search passed browser
  gesture checks. Remaining dialog/mutation gestures and visual/breakpoint
  parity were not automatically verified (preview checks timed out/capped).
- `@vercel/blob` reads existing private KYC objects when configured; database
  data-URL documents use the same authenticated private file route without
  an external storage token. No new upload/storage flow was introduced.

## V2 OTC console repairs (2026-10-05)
- Compose now makes V2 the OTC writer (`v2-api: OTC_ENGINE_ENABLED=true`) and
  disables only the legacy engine (`web: OTC_ENGINE_ENABLED=false`). Keep the
  advisory lock: never enable two independent writers for the shared tables.
- Vite serves the original public artwork directly from the read-only
  `/market-public` mount, configured by `VITE_PUBLIC_DIR`. There is no artwork
  proxy to Next and no `VITE_ICONS_TARGET` dependency. Admin artwork uses the
  verified legacy currency filenames and `?v=3`; the first 12 table logos are
  eager, the rest lazy, with a visible fallback on failure.
- Health reads never call `ensureEngine`. Catalogue bootstrap is a single
  batched upsert, single-flight once per process; downtime-gap audits are also
  batched so 361 remote DB roundtrips cannot stall the first pricing loop.
  Seed values/conflict columns and pricing/settlement algorithms are unchanged.
- Engine START/STOP persist the existing `engine_enabled` configuration;
  symbol PAUSE/RESUME/STOP do not start/reseed or stop the entire writer. START
  reports the actual leadership result, never unconditional success. A standby
  shutdown must not write a false STOPPED leader heartbeat.
- Redis tick envelopes carry the OHLC snapshot captured with that exact tick,
  including only the last two finalized candles per timeframe. The replay ring
  stays lean. Reading a newer local candle during delayed Redis delivery caused
  close/price mismatches; verify real socket delivery, not snapshots alone.
- `useAdminOtcConsole` refreshes visible pages every 3s and after asset/settings
  events without hiding rows, cancels obsolete reads/unmounted requests, and
  pauses background-tab polling. Do not cache private admin data for speed.
- Verified: server typecheck; 25 authenticated HTTP/DB assertions against a
  disposable PostgreSQL fixture; all 361 artwork URLs return image content;
  real Redis/Socket delivery has increasing sequences and matching candle
  closes; persisted checkpoints show no stale active symbols. Browser category
  and control-opening gestures passed, but visual/live-refresh and mutation
  gestures were not fully verified because the preview was hidden. Hidden tabs
  pause animation frames, lazy artwork, and the intentional background polling.

## V2 canvas chart overhaul (2026-10-06)
- `client/src/chart/ChartEngine.ts` now paints TWO stacked canvases: `base`
  (background, grid, candles, live-price line, trade overlays) and `overlay`
  (crosshair + axis tooltips). Only the layer that changed is repainted, so
  moving the mouse never redraws candles. The overlay canvas MUST keep
  `pointer-events: none` and the base `touch-action: none` (chart.css) or the
  base layer loses the drag/zoom/touch gestures.
- Pan is grab-and-drag with pointer capture. `viewRight` is the index anchored
  at the right edge, so it moves OPPOSITE the pointer:
  `viewRight = startViewRight - deltaX / barWidth`, always derived from the
  pointer-down start (never accumulated per move). Dragging right reveals older
  candles, dragging left returns to the live edge. Clamps:
  `min = plotWidth / barWidth` (index 0 stops exactly at the left edge) and
  `max = last + 4` (the allowed empty right margin).
- Candle drawing snaps every stroke/fill to whole device pixels: the centre X
  is computed once per candle, the wick is a 1-device-pixel line (`1/dpr`
  width, `+0.5/dpr` offset) and sits on the exact centre column of an
  odd-width body. Do not "simplify" this back to fractional coordinates — it
  reintroduces blurry, off-centre wicks at fractional DPR (the preview runs at
  DPR 0.9, 125%/150% browser zoom gives 1.25/1.5).
- `useOtcFeed.mergeTick` must never append a closed candle that is not NEWER
  than the local tail. The server re-sends `finalized.slice(-2)` on every roll
  AND after every resubscribe, so appending the whole ring duplicated the edge
  candles and injected a backwards time step — the visible "repeating
  staircase / flat dojis" at the right edge. Verify against the SERVER reducer
  first: `reduceTick` in `server/src/otc/candles.ts` keeps open fixed and
  tracks high/low, and REST history has no flat dojis, so this class of
  artifact is a client merge bug, not data.
- `snapIndex` is `round(xToIndex(x))`. `xToIndex` already returns the
  fractional index whose centre is at x; subtracting 0.5 offsets the crosshair
  by a whole bar.
- `chart/format.ts` (price precision by magnitude, clock/date formats) and
  `chart/ticks.ts` (1-2-5 price steps, round calendar time steps) hold the axis
  maths. Axis decimals = max(asset precision, decimals needed by the tick step).
- Dev-only handle: `import.meta.env.DEV` exposes the engine as
  `window.__nexaChartEngine` (`base`/`overlay` canvases, `candleX`, `indexAtX`,
  `_state`, `render()`). The preview panel is often hidden, which pauses rAF and
  leaves the chart zero-sized: call `eng.render()` to force a synchronous frame
  before reading canvas pixels, and call `eng.resize(w, h)` to give it geometry.
- Verification recipe that works without a visible preview: read
  `engine.candles` for `dupTimes` / `nonMonotonic` / `flatDojis`; dispatch
  `PointerEvent`/`WheelEvent` on `eng.base` and read `_state.viewRight` and
  `candleX(idx)` to prove drag direction, 1:1 following and zoom anchoring.
- Kept from the legacy chart: off-plot overlay dots are CLIPPED, never clamped
  into view, and `fitPriceRange` includes overlay prices so entry/exit marks
  stay framed; the Y scale refits to the visible range every frame.

### Phase 1 chart fixes (2026-10-06)
- **Smooth exponential zoom.** `onWheel` scales `barWidth` by
  `Math.exp(-delta * ZOOM_SENSITIVITY)` (`ZOOM_SENSITIVITY = 0.0016`) with the
  wheel delta normalised to pixels first (`deltaMode` 1 → ×16, 2 → ×plotBottom,
  then clamped to ±160). A notched mouse (~100) and a trackpad's stream of small
  deltas both scale smoothly. Do NOT bring back discrete zoom multipliers/
  presets: they jump by whole steps and read as jittery, unnatural zooming.
  The index under the cursor is sampled BEFORE the zoom (`idxBefore =
  xToIndex(cursorX)`) and re-pinned AFTER via
  `viewRight = idxBefore + (plotRight - cursorX) / barWidth - 0.5`, so the chart
  zooms around the pointer instead of the right edge. Clamped to
  `[MIN_BAR_WIDTH=1.5, MAX_BAR_WIDTH=48]`.
- **True OHLC aggregation when zoomed out.** `aggregateStep()` folds consecutive
  candles into ONE painted bar when a slot is narrower than
  `AGGREGATE_BELOW_PX = 4` (`Math.ceil(4 / barWidth)`), drawing real
  open/high/low/close (`high` = max of block highs, `low` = min of block lows,
  open = first, close = last) instead of a blur of 1px columns. Only FULL blocks
  of candles where both ends are `finalized` merge; the forming candle and any
  leftover tail always stay 1:1 so the live bar keeps its own resolution. Never
  synthesize a staircase by drawing open/close as a vertical line — aggregate
  real OHLC.
- **Infinite left-scroll history.** The engine fires `onNeedOlder()` once when
  fewer than `PREFETCH_LEFT_SLOTS = 60` candles remain left of the viewport,
  latched by `olderPending` so only one page is in flight; the caller MUST call
  `setOlderPending(false)` when the page resolves (or fails) or prefetching
  parks forever. `CanvasChart` wires this to `useOtcFeed.loadOlder`, which pages
  `OLDER_PAGE = 300` candles with the server's `before` cursor (each page
  contiguous with the oldest held candle) and prepends them. The in-memory
  series is capped at `MAX_CANDLES = 2000` on BOTH the live merge and the older
  page (`loadOlder` refuses once at the cap; the oldest candles are dropped).
  A failed page leaves the current window in place.
- **Stable, eased Y-scale.** `resolveRange()` eases the drawn price scale toward
  the freshly fitted target (`RANGE_EASE = 0.3` per frame) so zoom, pan and
  symbol switches glide instead of snapping; a relative move below
  `RANGE_SNAP_REL = 0.004` snaps instantly so an ordinary live tick never lags
  the price line. While easing it keeps requesting base frames until settled. A
  fresh/symbol-switched series resets `range = null` so it never eases from the
  previous asset's scale.
- **Premium live-price line + glued countdown.** `drawPriceLine` paints the
  latest close as an OPAQUE WHITE 2px line (`PRICE_LINE_W = 2`, theme
  `priceLine: '#ffffff'`, `setLineDash([])`) drawn as a whole number of device
  pixels on a whole-device-pixel row, so it stays fully crisp at fractional DPR
  (the preview runs 0.9). The right-axis badge is `priceLabelBg: '#2986ff'` with
  white text. `onPriceLineY(rawY)` reports the line's plot-space Y (CSS px) to
  React, which positions the `.chart-live-timer` countdown at `top: priceLineY`
  so the timer and price move in lockstep; it reports `null` when the line is
  off-plot so the timer hides rather than floating. The timer is pinned FLUSH to
  the plot's LEFT edge (`chart.css`: `left: 0`, no `right` offset — the user's
  reference), not to the right gutter. The crosshair price tooltip
  suppresses itself within `TAG_H + 2` of `liveBadgeY` so the two tags never
  overlap.
- Scope note: these are CLIENT-ONLY chart changes. The backend OTC engine and
  its data generation (including the long-duration upward price drift in the
  reference/synth data) are deliberately left untouched; volatility is a later
  phase. Do not "fix" drift in `server/src/otc/*` as part of chart work.

### Phase 1 premium trade panel — real market + real orders (2026-10-06)
- `/chart` (`pages/ChartPage.tsx`) is REAL end to end — there is NO demo mode.
  `components/Trade/useDemoTrades.ts` was deleted; do not reintroduce mocked
  order state. Orders post to `POST /api/trades` and open positions come from
  `fetchAllTrades` (`lib/trades.ts`), polled every 8s and filtered by account
  mode (`stores/accountModeStore.ts`).
- The 361-instrument OTC catalogue (`GET /api/market/otc/assets`) is loaded by
  `hooks/useOtcAssets.ts` (module-level cache, one request per page load) and
  rendered by `components/Market/MarketSelector.tsx` (`styles/market-selector.css`):
  six tabs — All / Crypto / Stocks / Currency / Indices / Commodities — with live
  counts, a search box and each instrument's payout rate. Tab keys are the raw
  API category values (CRYPTO/STOCK/FOREX/INDEX/COMMODITY); FOREX is labelled
  "Currency", matching the legacy drawer. Verify by opening the selector on
  `/chart`: All lists 361 rows and the tab counts read 110/75/83/46/47 —
  registry counts alone do not prove the client.
- The chart toolbar's market control is a button (`ChartToolbar.tsx`,
  `.chart-market-btn`, styled in `chart.css`) that opens the selector;
  `CanvasChart` now takes `onOpenMarket` + `assetName` instead of the old
  5-symbol `onSymbolChange` `<select>`. Never hardcode a symbol list again —
  on `/chart` the catalogue is the only source of names and payout rates.
- `TradePanel.tsx` takes `account`, `signedIn` and a server `error` prop; its
  direction type is `CALL` | `PUT` (button labels stay UP / DOWN).
  `ActiveTrades.tsx` renders real `UiTrade` rows and projects P/L only against
  the chart's live price for the SAME symbol (other markets stay flat); pending
  rows read "Confirming…". Its `nxt-trade__bar` is an additive property, not a
  flex child — keep the parent `position: relative` if you touch the markup.
- `authStore.refresh()` was added (re-reads `/auth/me` without flipping status
  to `loading`). `TerminalPage` already called a non-existent `refresh`, so the
  same addition fixes that pre-existing TS2339 (and its runtime TypeError on
  every trade).
- `/chart` stays PUBLIC: a signed-out visitor sees the live chart and the full
  catalogue, and the ticket answers "Sign in to trade." — there is no demo
  fallback to hide that.

### Chart tool pop-up windows (2026-10-06)
- The chart-type and drawings buttons open ONE shared pop-up window
  (`components/Chart/ChartToolPopup.tsx` + `styles/chart-tools-popup.css`) on
  BOTH surfaces: the terminal's `ChartControls` (left rail on desktop, phone bar)
  and the chart page's floating `ChartTools` column. `ChartTools` re-exports
  `ChartType` from the shared module, so existing
  `import type { ChartType } from './ChartTools'` paths keep working.
- `components/Chart/chartToolOptions.tsx` owns the shared style/drawing
  catalogues (`CHART_TYPE_OPTIONS`, `DRAW_SECTIONS`, `toolIcon`). Add or change an
  option THERE — never in one toolbar only, or the two windows drift apart.
- `.chtools` sets `backdrop-filter`, which makes it the containing block for the
  fixed-position card: `.chtools .toolpop--floating` (left 56 / bottom 52) is
  measured from the column, not the viewport, and the ≤768px block turns it into
  a bottom sheet. Verify on `/chart` (public, no sign-in) by clicking the
  chart-type and drawings buttons: a titled `role="dialog"` card opens and the
  chart-type button's label follows the pick (`Chart type Bars`,
  `__nexaChartEngine._state.chartType === 'bars'`).
- The drawing tools are still UI-only (selection state, no on-chart painter) —
  the same as the terminal's window; do not claim drawings are painted.

### Header favorites + live payouts (2026-10-06)
- The top bar's quick-access tabs are the FAVORITES ONLY. Do not reinstate the
  old "current market first" rule: a market that is merely open on the chart
  must NOT appear up there — users open many markets without starring any, and
  every one of them leaked into the header. `favoritesStore` prepends a new
  star, so the market just favorited lands in the FIRST slot and the rest shift
  right. With no favorites the bar shows only the "Star a market to pin it
  here" hint.
- Payouts are LIVE, never the frozen `payout_percentage` column. ONE pure
  derivation owns the number: `server/src/otc/payouts.ts`
  (`livePayoutRate(symbol, baseRate, { regime, now })`) — base rate ±
  `PAYOUT_BAND` (3) plus at most one point of regime bias, held for
  `PAYOUT_STEP_MS` (15s), phase-offset per symbol so the board does not move as
  one. The catalogue (`/api/market/otc/assets`), the per-symbol snapshot, the
  live feed (`GET /api/market/otc/payouts`, in-memory, zero DB roundtrips) and
  TRADE PLACEMENT (`trade/engine.ts` → `trades.payout_rate`) all call it, so the
  rate the trader sees is the rate the trade settles on. Never display a payout
  the server would not apply — that mismatch is exactly what this replaced.
- The client reads ONE shared feed: `stores/payoutStore.ts` (`useLivePayouts()`,
  2s poll, ref-counted so the header and the open market list never
  double-request). The header tabs, the market-list PAYOUT column, the ticket
  and the mobile sheet all read it; the catalogue's own `payoutRate` is only the
  cold-start fallback.
- Verify without a visible preview: call `/api/market/otc/payouts` twice 16s+
  apart — ~290 of 361 rates move — and confirm every rate stays within 4 points
  of the DB base (`store.loadOtcInstruments`), which is what keeps admin payout
  edits authoritative. In the browser, an empty `nexa.chart.favorites` must
  leave the header with NO asset tabs, and starring a row must shift it into
  slot 1.

## Terminal repair round (2026-10-06) — why "it works, then breaks again"
- The V2 dev API (`tsx watch`) restarts on EVERY file change, so while anyone is
  editing, `/api/*` answers 5xx or refuses the connection for a second or two.
  Two client bugs turned that blip into a broken session:
  - `stores/authStore.bootstrap()` treated ANY non-200 `/auth/me` (including a
    proxy ECONNREFUSED/500) as "no session" and set `guest`, so the user was
    silently signed out mid-session and every trade then failed with
    "Insufficient … balance". `readSession()` now retries transient failures and
    only an explicit 401 signs out; an unreachable API keeps the current session.
  - `hooks/useOtcFeed` emitted `otc:subscribe` ONLY after the history fetch
    resolved. A socket reconnect (API restart, dropped connection) left the
    gateway with no subscription for that socket, so the chart froze on its last
    candles until a manual reload. The feed now re-emits `otc:subscribe` on every
    `connect`, resuming from the last delivered sequence.
- Trade placement was rejected for 9 of the 12 expiries the ticket offers: the
  legacy `ALLOWED_DURATIONS = [60, 120, 300]` whitelist vs. the 5s-8h picker, so
  the whole TIME tab was dead. The whitelist now matches the picker exactly
  (`server/src/trade/engine.ts`); `tests/trade-parity.test.ts` asserts the new
  list. Settlement/profit/cashback rules are unchanged.
- The notification bell moved out of the chart's floating toolbar
  (`pages/dashboard/TerminalPage.tsx`) into the terminal topbar next to the
  account balance (`pages/dashboard/DashboardLayout.tsx`, `.terminal-bell-btn`).
  The chart toolbar keeps timeframe / indicators / drawings / fullscreen only.

## V2 trade store vs. the shared PostgreSQL schema (2026-10-06)
- `platform-v2/server/src/trade/*` must query the SAME schema the legacy Next app
  owns (`src/lib/db.js`), not the legacy SQLite column names. Confirmed columns:
  `trades(symbol, stake, profit, expires_at, copied_from, status)` and
  `users(... alias ...)` — there is **no `users.avatar_color`** and **no
  `copy_subscriptions` table**. Copy trading lives in `copy_links`
  (`fixed_stake`, `ratio`, `mode`, `is_active BOOLEAN`); the V2 API surfaces
  `fixed_stake` as `amount_per_trade`, so the routes/client contract is unchanged.
  `activeCopySubscriptions` is what the OTC engine's `propagateCopies` reads, so a
  stray table name there logs `copy propagation error` on every leader trade.
- Boolean columns are real `BOOLEAN`s — compare with `TRUE`/`FALSE`, never `= 1`.
- An unhandled rejection in an async Express route **kills the `v2-api` process**
  (e.g. a nonexistent column in a `SELECT` took the whole API down and the
  preview with it), so a schema mismatch here is a hard outage, not a 500.
- Verify copy trading end to end against the LOCAL dev Postgres: register two
  users, `POST /api/trades/copy/subscribe` as the follower, then have the leader
  `POST /api/trades` — the follower's `GET /api/trades/active` must show a copied
  position with `copied_from` set to the leader's trade id, and a `copy_links`
  row must exist.

## Apex Blueprint marketing surface (2026-10-06)
- Tailwind v4 (`tailwindcss` + `@tailwindcss/vite`) is now a v2-client devDependency,
  imported from `src/apex/styles/apex.css` WITHOUT preflight
  (`@import 'tailwindcss/theme.css' layer(theme)` + `utilities.css layer(utilities)`).
  Do NOT switch to a bare `@import 'tailwindcss'`: preflight would reset the
  existing terminal / chart / admin styling this project still relies on.
  A dependency change needs a `v2-client` restart (compose runs `npm ci` against
  the lockfile, and node_modules is an anonymous volume).
- All Apex code lives in `src/apex/` and touches nothing else: no chart, no
  Micro-JSON parser, no socket layer, no server/DB changes. `/` is now the Apex
  landing page; the Module-1 wiring/status page moved to `/status`.
- Every simulated value renders through `<DemoBadge />` (it emits
  `data-demo-badge="demo|sample|unverified"`, which is how to verify coverage).
  `DEMO_MODE` and all marketing claims live in
  `src/apex/config/content.config.ts`; a claim renders as a fact only when
  `verified: true`, otherwise as "Demo".
- The fairness verifier (`src/apex/lib/provablyFair.ts`) uses real Web Crypto:
  commitment = SHA-256(serverSeed); settlement = HMAC-SHA256(serverSeed,
  `${clientSeed}:${nonce}`). For the shipped sample seeds the expected settlement
  digest is 075fa50ce8d3f5dc47ba396806c2c57c4f372892b0bb179d1f17454be0a5d846.
- `npm run typecheck` reports ~119 PRE-EXISTING errors (admin pages import `@/…`
  paths that tsconfig has no `paths` mapping for). `src/apex/**` typechecks clean;
  do not "fix" the admin errors as part of Apex work.

## Apex surface updates (2026-10-06, later)
- No "DEMO" labelling anywhere on the Apex surface: `components/DemoBadge.tsx` is
  deleted, `DEMO_MODE` is gone from `content.config.ts`, and `PillarStatus` is
  `live | planned` only. Claims without a measured `value` render "Not measured
  yet"; unmeasured metrics still render "—". `providers/mock/*.ts` keep
  `source: 'demo'` internally — that field is metadata and is never rendered.
- `FAIRNESS_SAMPLE` seeds are now `9f2b7c4e…` / `0d5e8a3f…`; the shipped
  settlement digest (HMAC-SHA256 keyed by the server seed over `clientSeed:nonce`)
  is `1c44e1ae…3545`. If the seeds change again, recompute it — never hand-write.
- The AI widget's `send()` arms a `STREAM_STALL_MS` (3s) watchdog, rearmed on
  every chunk: a provider stream that dies mid-reply releases the composer
  instead of leaving every chip and the send button disabled forever. Keep it.
- BRAND IS **TRADEON** on the whole Apex surface. `BRAND.name = 'TRADEON'`,
  `BRAND.headline` is the hero h1, and `BRAND.tagline` is the brand subtitle
  "SMART TRADING. ALWAYS ON." — **hero lockup only**, rendered by
  `components/TradeonLogo.tsx` with `showTagline` (header / footer / sidebars
  must never pass it). There is no `BRAND.product` any more.
- The old `Nova AI` name is gone everywhere: `BRAND.assistantName` is
  `'TRADEON AI'` (widget launcher, panel header, input label, pillar card) and
  the provider id is `tradeon-assistant`.
- Brand artwork: `public/brand/tradeon-mark.png` (monogram) and
  `tradeon-wordmark.png` ("TRADEON", no subtitle). **Both PNGs must stay
  TRANSPARENT** — an earlier export carried an opaque near-black background that
  rendered as a visible dark box behind/around the lockup on the hero; the
  artwork is alpha-keyed by luminance (bright cyan/white strokes over a black
  backdrop), so never re-export them with a baked background.
- The dashboard shell (user panel) renders the SAME `BrandMark` lockup as the
  admin sidebar: `.dash-brand` in `DashboardLayout.tsx` (monogram only when the
  rail is collapsed) and `.dash-terminal-logo` in the terminal topbar (monogram
  only). Do not put a letter/gradient tile behind it. `vite.config.ts` sets
  `publicDir` to `VITE_PUBLIC_DIR` = the ROOT `public/` — **not**
  `platform-v2/client/public/`. Files added to the root `public/` are NOT served
  until `v2-client` is restarted (Vite caches the public dir listing at boot:
  a brand-new file 404s into the SPA fallback HTML). The client's own
  `public/` folder is unused. Legacy `src/components/BrandMark.jsx` (Next app)
  still uses `tradeon-mark.svg`, which stays.
- Accent palette follows the logo: `--color-apex-cyan: #00e5ff`,
  `--color-apex-lime: #00ff66`; `--color-apex-gold` and `--apex-glow-gold` were
  removed, and `.apex-btn--primary` is the cyan→lime brand gradient. Do not
  reintroduce gold CTAs.
- `PillarStatus` is now `live | preview | planned` (`Preview` = shipped,
  interactive interface with no backing service). All six pillars render a card
  and the last three link to their section (`#social`, `#tournaments`,
  `#institutional`).
- **Metrics are LIVE.** `providers/live/metrics.ts` reads `/api/health/otc`
  (engine uptime, ticks published, instruments streaming, measured round-trip);
  `providers/live/market.ts` reads `/api/market/otc/payouts`. The old
  `providers/mock/metrics.ts` (all-null tiles — the "no data" state the user
  reported) is deleted; never restore a metrics provider that returns nulls.
  Tiles group thousands and print a local clock time, so a large counter and a
  raw ISO stamp both stay readable.
- `MetricsStrip` values arrive through `useResource`, so the tiles show
  skeletons first — a landing-page screenshot taken too early shows blanks that
  are NOT a bug.
- The three new sections are `features/copy-trading/CopyTradingSection.tsx`
  (`#social`), `features/gamification/GamificationSection.tsx` (`#tournaments`)
  and `features/institutional/InstitutionalSection.tsx` (`#institutional`).
  They carry no invented performance figures: leader cards show LIVE payout
  rates, the tournament countdown runs off a real clock, and the API capability
  matrix lists only endpoints that genuinely answer on this deployment.
  The allocation modal's confirm is gated behind the risk-acknowledgement
  checkbox — keep that gate.
- Verifying the widget in the Base44 preview: the preview tab is usually hidden,
  so `setTimeout` is throttled to ~1s and a reply streams about one chunk per
  second (normal, visible-tab completion is <1s). A `preview_execute_code` call
  that runs past its timeout ABORTS the page's pending timers and freezes an
  in-flight stream mid-sentence — verify with short scripts, never one long
  polling eval.
- Verified by gesture on `/`: launcher opens the panel, a suggested prompt
  streams the full reply, and the rendered page contains zero "demo" matches.

## Live social ticker (2026-10-06)
- `src/apex/features/social-ticker/` — `LiveSocialTicker.tsx` (fixed bottom-left,
  `z-50`, `pointer-events-none` so it never blocks the landing CTAs or the
  canvas chart), plus `identities.ts` (masked name/wallet handles) and
  `events.ts` (event model + generator). Mounted once in `ApexLandingPage`, next
  to `AIAssistantWidget`.
- Cadence is a RECURSIVE `setTimeout` with a `Math.random()` gap of 4–15s
  (`randomDelayMs`), never a fixed `setInterval` — a metronomic interval is what
  reads as fake. Each toast holds `HOLD_MS` (5.2s); the first appears after
  `FIRST_DELAY_MS` (2.4s) so the surface looks alive immediately. Amounts use an
  uneven cent value so deposits never look staged.
- `DEMO_MODE` was REINTRODUCED in `content.config.ts` (the earlier "DEMO_MODE is
  gone" note is superseded) at the user's request. `true` → the ticker
  fabricates activity; `false` → it listens on the `social:activity` socket
  channel via `toTickerEvent`. The socket is imported lazily so demo mode never
  opens a connection. This is the marketing surface only — it does NOT apply to
  `/chart`, which stays real end to end.
- The ticker lifts to `bottom-20` below the `sm` breakpoint so it clears the
  fixed bottom-right AI launcher (verified at 373×665: toast bottom 585 vs
  launcher top 597). Verify by waiting on `div[role="status"] .apex-glass`; the
  `role="status"` container is always present, so selecting it alone proves
  nothing.

## Landing overflow fix + AI assistant upgrade (2026-10-06)
- `MetricsStrip` is a TWO-column grid at EVERY width (`grid-cols-1
  sm:grid-cols-2`). Do NOT restore `lg:grid-cols-4`: the strip sits in the
  fairness section's right column (~500px), so four tiles were ~110px wide and a
  grouped counter like "4,595,488" plus the "TICKS PUBLISHED" label spilled out
  of the card (the user's screenshot). Tiles also carry `min-w-0` +
  `break-words` + `tabular-nums` and drop to `text-xl` below `sm`, so a longer
  value cannot overflow again. Verified on `/` at 1004px: `documentElement`
  scrollWidth == clientWidth (no offender except a text input's own scrolling).
- The AI assistant's prompts live INSIDE the conversation: an intro bubble with
  the suggested chips when the chat is empty, and follow-up chips beneath a
  FINISHED reply. The composer row holds ONLY the input and the send button —
  never a detached chip row above it (rejected twice by the user). Verified by
  gesture on `/`: chips render inside the log (`[aria-live="polite"]`),
  `panel.lastElementChild` has one icon-only button, and clicking a chip appends
  the user bubble + a streamed assistant reply.
- `providers/mock/ai.ts` owns the whole answer set in `KNOWLEDGE` (one entry =
  reply body + its follow-up prompts, `%SYM%`/`%PCT%`/`%NAME%` substituted at
  render). The `AIAssistantProvider` interface gained
  `followUps(prompt, context)`. Add a topic by adding ONE entry there; the
  widget needs no change. The old "…" streaming placeholder is now a three-dot
  typing indicator.
- Note: `CopyTradingSection.tsx` still has a PRE-EXISTING unused-variable error
  (`payoutPending`, TS6133) unrelated to this work; `src/apex/**` is otherwise
  typecheck-clean for the files touched here.
