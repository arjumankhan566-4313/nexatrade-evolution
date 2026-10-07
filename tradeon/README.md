# NexaTrade — Next-Gen 3D Trading Platform

## Current migration update — 2026-10-02

This repository contains the complete updated source, including the admin and user panels, private database KYC uploads with manual admin review, shared branding/loading animation, and market asset logos.

- The current catalogue has 438 assets. The active terminal uses ECharts and defaults to genuine 5-second crypto candles assembled from exchange data.
- Fast rendering is automatic; the `Live · Fast` dropdown has been removed. Candle close, header price, price line and volume synchronization are covered by the latest checks.
- The latest production build succeeded and 148 tests passed. Browser checks matched 12 completed BTC/ETH candles against exchange OHLCV.
- Free Forex/stock quotes can be delayed or last-market quotes. These are not a 24/7 live execution feed; no synthetic OTC market was added.
- Private environment settings, owner passwords, database records, dependencies and build output are not stored in this repository. Configure the deployment environment and database before running it.

Start with [বাংলা installation instructions](docs/INSTALL-BN.md), [latest changes and verification](docs/CANDLE-SYNC-UPDATE.md), and [account/admin configuration](docs/ACCOUNT-AUDIT.md). The older platform overview below describes earlier releases; its historical instrument counts, chart implementation and test totals are superseded by this update.

## Earlier platform overview

A premium, production-ready trading platform: a cinematic WebGL landing page, a professional
real-time trading terminal over **152 live instruments**, biometric KYC with liveness detection,
social **copy trading**, tournaments with automated prize pools, and a hidden admin console with a
full **CRUD risk-management engine** whose changes reach every open session in under a second — all
on a persistent cloud database.

```
Next.js 15 (App Router) · React 19 · Three.js / react-three-fiber · Framer Motion
TradingView Lightweight Charts · Node.js API routes · PostgreSQL (Neon/Supabase) · JWT in HTTP-only cookies
```

---

## 🚀 Deploy in 3 minutes (no terminal required)

### Option A — Vercel + Neon (recommended)

1. Create a free Postgres at **[neon.tech](https://neon.tech)** (or Supabase) and copy the connection string.
2. Import this repository on **[vercel.com/new](https://vercel.com/new)**.
3. Add these Environment Variables, then hit **Deploy**:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
   | `JWT_SECRET` | any random 48-char string |
   | `SUPER_ADMIN_PASSWORD` | your owner password, at least 12 characters |
   | `ADMIN_EMAIL` | optional secondary staff admin email |
   | `ADMIN_PASSWORD` | secondary staff password, at least 12 characters |
   | `CRON_SECRET` | any random string |
   | `FINNHUB_API_KEY` | *(optional — better forex/metals data)* |

4. The schema and market list are created automatically on first boot. The owner account is
   provisioned only when a valid `SUPER_ADMIN_PASSWORD` is configured.
   `vercel.json` already registers a **cron job that settles expiring trades every minute**.

### Option B — Render (one click, database included)

[`render.yaml`](./render.yaml) provisions the web service, a managed PostgreSQL database and the
settlement cron together:

```
https://render.com/deploy?repo=https://github.com/arjumankhan566-4313/NexaTrade-Migration
```

### Local development

```bash
npm install
npm run dev            # http://localhost:3000
```

Without `DATABASE_URL` the app boots an **embedded PGlite** database in `./.data` (real Postgres
compiled to WASM) so nothing extra is needed locally. Set `DATABASE_URL` for real persistence.

```bash
npm test               # risk-engine + KYC test suite
npm run db:init        # verify/seed a cloud database
```

---

## 🆕 v3 — UI/UX, RBAC, payments & performance overhaul

**Role-Based Access Control (Module 3).** Four staff roles with an inherited permission
matrix (`src/lib/rbac.js`): **SUPER_ADMIN → ADMIN → EDITOR → MODERATOR**. The owner is a
hard-protected SUPER_ADMIN provisioned from `SUPER_ADMIN_PASSWORD` and **cannot be deleted,
demoted, blocked or have sessions revoked from the admin panel** (enforced in the API).

| Login | Value |
|---|---|
| Portal | `/nexa-admin-portal/login` |
| Email | `arjumankhan181@gmail.com` |
| Password | The configured `SUPER_ADMIN_PASSWORD` (at least 12 characters; no default) |

**Dual-mode payments (Module 5).** Deposits support an **Automatic** crypto-gateway mode and a
**Manual** mode: local rails (bKash / Nagad / bank) and crypto (USDT/BTC) each show the
platform wallet/QR, require TrxID + sender account + a screenshot proof, and land in the admin
finance queue at `/nexa-admin-portal/finance`. Approval/rejection runs in a **single atomic
database transaction with row-level locking** (`withTransaction`), so balances can never be
double-credited or lost. Payment rails are full-CRUD managed from the same page.

**Cinematic preloader & redesigned mark (Module 4).** The old gold ring is replaced by a GSAP
three-act intro: a metallic/glassmorphism **3D "N"** materialises stroke-by-stroke, morphs into
the wordmark **"NexaTrade"**, then fades into the landing page. The 2D logo is an advanced
geometric-N candlestick mark. A new **trust section** shows live global 24h volume, bank-grade
encryption, instant withdrawals and compliance badges.

**Performance & balance integrity.** The terminal now opens **one** market-wide Binance
`!miniTicker` stream (was ~150 per-symbol sockets), the chart is an isolated `React.memo` surface
fed imperatively, the market list owns its own subscription, and the open-position countdowns run
on a private 1s clock — so candles tick at exchange speed without React re-render lag. The session
provider ignores out-of-order poll responses and confirms a 401 before ever clearing a balance, so
balances never fluctuate or disappear on a flaky connection.

**Mobile-first.** Off-canvas drawer, a fixed **bottom navigation bar**, full-width chart with the
CALL/PUT ticket stacked cleanly below it, and responsive type/spacing across breakpoints.

---

## 🗺️ Routing architecture

| Route | Access | Purpose |
|---|---|---|
| `/` | public | 3D landing page, live Binance ticker, marketing, auth entry points |
| `/login`, `/signup` | public | Account access (redirects to the terminal if already signed in) |
| `/dashboard` | 🔒 user JWT | Trading terminal — live chart, indicators, order ticket, open positions |
| `/dashboard/multi` | 🔒 user JWT | Multi-chart workspace — up to 4 live charts side by side |
| `/dashboard/social` | 🔒 user JWT | Leaderboard & auto-copy trading |
| `/dashboard/tournaments` | 🔒 user JWT | Tournament lobby, standings and the VIP ladder |
| `/dashboard/wallet` | 🔒 user JWT | Deposits, withdrawals, transaction history |
| `/dashboard/kyc` | 🔒 user JWT | Biometric identity verification wizard |
| `/dashboard/history` | 🔒 user JWT | Full trade ledger and statistics |
| `/dashboard/security` | 🔒 user JWT | Password change, device sign-out, IP/device activity log |
| **`/nexa-admin-portal`** | 🔒 admin JWT | **Secret** admin console (noindex, separate cookie, separate UI) |
| `/nexa-admin-portal/users` | 🔒 admin | Accounts, balances, per-user risk overrides |
| `/nexa-admin-portal/kyc` | 🔒 admin | Manual ID ↔ live-face review queue |
| `/nexa-admin-portal/finance` | 🔒 admin | Deposit / withdrawal approvals |
| `/nexa-admin-portal/risk` | 🔒 admin | **Risk engine**: target win rate, force-loss breaker, module switches |
| `/nexa-admin-portal/assets` | 🔒 admin | Market catalogue CRUD (create / edit / disable / delete) |
| `/nexa-admin-portal/gamification` | 🔒 admin | Tournaments & VIP tiers CRUD, prize payouts |
| `/nexa-admin-portal/fraud` | 🔒 admin | Multi-account clusters, sharp-trader alerts, rapid-fire monitor |
| `/nexa-admin-portal/logs` | 🔒 admin | Security log with IP + device forensics |

`src/middleware.js` enforces the separation at the edge: the user cookie (`nexa_session`) can never
open the admin panel and the admin cookie (`nexa_admin`) is a different, shorter-lived session, so
an admin and a user can be signed in simultaneously in the same browser without logging each other out.

---

## 📦 Modules

### 1 · Branding & 3D landing page
* **3D metallic mark** (`src/components/three/NexaMark3D.jsx`) — a glass-and-metal "N" whose strokes
  ignite and glide into place inside a thin orbiting ring (no more gold hex ring).
* **Cinematic preloader** (`src/components/Preloader.jsx`) — a GSAP three-act intro: the 3D "N"
  materialises, morphs into the "NexaTrade" wordmark, then fades into the page (once per session,
  skipped for reduced-motion users).
* **Hero backdrop** (`HeroBackground.jsx`) — instanced "market data nodes", a wire constellation and
  floating candlestick columns, with a parallax camera rig. Density drops automatically on mobile and
  is disabled entirely under `prefers-reduced-motion`.
* **Scroll choreography** — Framer Motion fade/scale/slide reveals, parallax hero, glassmorphism
  feature cards for *Real-Time Execution*, *Bank-Grade Security* and *Instant Withdrawals*.
* **Live ticker** — genuine Binance prices streaming in the visitor's browser, before any signup.

### 2 · Routing & panel separation
See the table above. The admin portal lives on an unguessable path, is `noindex, nofollow`, uses its
own cookie, its own login screen and a data-dense layout with zero shared chrome with the user app.

### 3 · Security & biometric KYC
* **Country-aware documents** — 23 countries with their own accepted document sets (NID, Passport,
  Emirates ID, MyKad, Aadhaar, CNIC…) and per-country front/back requirements (`src/lib/countries.js`).
* **Liveness detection** (`src/lib/biometrics.js`) — a randomised 3-challenge sequence (turn left /
  turn right / blink / lean closer) scored from real per-frame signals: motion energy, face-box travel,
  scale growth and eye-region intensity dips.
* **Face matching** — the portrait is located on the ID (native `FaceDetector` when available, else a
  YCbCr skin-tone segmentation), a 384-dim descriptor is built (illumination-normalised intensity patch
  + gradient-orientation histogram) for both the ID and the live capture, and compared by calibrated
  cosine similarity.
* **Anti-spoof** — the server hashes both uploads and rejects a "selfie" that is byte-identical to the
  ID image, logging a `KYC_SPOOF_ATTEMPT` critical event.
* **Status flow** — `NONE → UNDER_REVIEW → VERIFIED / REJECTED`, with the final decision always made by
  a human in the admin queue.
* **Sessions** — HS256 JWTs in `httpOnly`, `sameSite=lax`, `secure` cookies, with a `token_version`
  claim so an admin (or the user, from `/dashboard/security`) can revoke every other session instantly.
  Changing a password signs out every other device while keeping the current one alive.
* **Forensics** — every login, trade, deposit, withdrawal, KYC action and admin change is written to
  `security_logs` with IP, parsed device string and user agent.

### 4 · Real market data & terminal — 152 instruments
| Class | Count | Feed |
|---|---|---|
| Crypto | **57 pairs** | Binance public WebSocket (browser-side, no key) |
| Forex | **35 pairs** | Finnhub (OANDA) → Polygon → Yahoo → key-free FX |
| Commodities | **8** | Gold, Silver, Platinum, Palladium, WTI, Brent, Nat Gas, Copper |
| Stocks | **41** | Apple, Tesla, NVIDIA, Alibaba… via Finnhub / Polygon / Yahoo |
| Indices | **11** | S&P 500, NASDAQ, Dow, DAX, Nikkei, Hang Seng, VIX… |

The catalogue lives in `src/lib/assetCatalog.js` and is installed by a versioned migration, so
instruments the owner deletes or renames from the admin panel are never resurrected on redeploy.

* **Pro charting** — TradingView Lightweight Charts **v5 multi-pane**: MA 20, EMA 50 and Bollinger
  Bands overlay the candles, while RSI 14 (with 30/70 guides) and MACD 12·26·9 (histogram + signal)
  each get their own pane. All studies are computed client-side in `src/lib/indicators.js` from the
  same candle series, so they refresh on every tick with no extra network call.
* **Multi-chart layout** — `/dashboard/multi` runs 1, 2 or 4 live charts at once, each with its own
  instrument, timeframe and indicator set.
* **Crypto** — the browser connects directly to `wss://stream.binance.com:9443/stream`
  (`@ticker` + `@kline_1s`), so candles update every second with **no server relay and no API key**.
* **Forex / commodities** — a single server-side **Finnhub WebSocket relay** (`wss://ws.finnhub.io`)
  fans real-time ticks out to every browser through a **Server-Sent Events** stream
  (`/api/market/stream`), so the provider key never reaches the client. If no key is configured — or
  the host is serverless, where sockets cannot outlive a request — it degrades automatically to
  Finnhub REST → Polygon → Yahoo → key-free FX/metal providers, and finally to plain polling.
  The terminal shows which transport is live (`Binance WebSocket` / `Edge stream (SSE)` / `Edge polling`).
* **Charting** — TradingView Lightweight Charts v5 with live candle assembly, entry-price lines for
  every open position, pinch/drag touch handling and `autoSize` responsiveness.
* **No dummy data, ever** — if every upstream is unreachable the UI says *"feed offline"* and expiring
  trades are retried rather than settled against an invented price (and refunded as `VOID` after 5 min).
* **Settlement price integrity** — the server always prefers its own upstream fetch; browser-observed
  prices are mirrored into `market_ticks` and only used as a median fallback, flagged as
  `CLIENT_MEDIAN` on the trade row for audit.

### 5 · Social trading, tournaments & VIP
* **Auto-copy trading** — follow any trader on the leaderboard and every position they open is
  mirrored into your account within a second, sized by percentage of their stake or a fixed amount,
  always clamped by your own per-trade cap. Copied trades never re-copy (no recursion), skipped
  copies (insufficient balance, inactive market) notify the follower instead of failing silently.
* **Global leaderboard** — ranked from **real settled trades**: win rate, net P/L, ROI, volume and
  follower count over a 7 / 30 / 90-day window. Nothing is simulated.
* **Tournaments** — entry fees accumulate into the prize pool on top of any guaranteed amount;
  standings are computed live from the P/L of trades placed inside the window, and finishing pays the
  configured split (`[50,30,20]` by default) straight into the winners' balances with notifications.
  The settlement cron starts and finishes tournaments on schedule.
* **VIP tiers** — Standard / Gold / VIP by 30-day volume (fully editable, add your own). The tier's
  payout bonus is added to every market's base payout at order time, and promotions are pushed to the
  trader in real time.

### 6 · Admin dashboard, realtime sync & full CRUD
* **Global Target Win Rate** — set e.g. `30`, and ~70% of all expiring trades book a loss. It is a
  *closed-loop controller*, not a coin flip: it measures each account's realised win rate over the
  last 25 settlements and biases the next outcome to pull the realised rate back to target.
* **Force-Loss circuit breaker** (`enable_force_loss`) — global toggle; every expiring trade books as a
  loss regardless of the real market price.
* **Per-user override** — `custom_yield_ratio` (0–100 %) and a per-user force-loss switch on each
  profile; these take precedence over the global target.
* **Full auditability** — when the engine overrides the market, the trade stores the true
  `market_price`, the micro-adjusted `exit_price`, `is_adjusted = true` and the reason
  (`FORCE_LOSS_GLOBAL`, `FORCE_LOSS_USER`, `YIELD_CONTROL`, `NATURAL`).
* **Manual KYC review** — ID front/back and the live capture displayed side-by-side with zoom, plus
  biometric scores, liveness check results and risk flags.
* **Finance queue** — approve/reject deposits and withdrawals (crypto and local rails such as bKash,
  Nagad, Rocket, bank transfer); approvals move real balances atomically.
* **Live telemetry** — target vs. realised win rate meter, platform P/L, engine-adjusted trade count.

#### Zero-latency admin → user sync
Every consequential mutation is appended to a `platform_events` bus and streamed to open sessions by
`GET /api/events/stream` (Server-Sent Events, ~1 s poll, self-rotating for serverless budgets):

| Topic | Reaches | Effect in the UI |
|---|---|---|
| `settings` | everyone | Payouts, limits, module switches morph in place |
| `assets` | everyone | New/edited/deleted markets appear or vanish from the terminal |
| `tiers`, `tournaments` | everyone | VIP ladder and lobby update live |
| `balance`, `trade`, `kyc`, `notification` | one user | Balances, results and KYC state update instantly |
| `session` | one user | Blocked/revoked/deleted accounts are signed out immediately |

A database table is used as the transport (rather than an in-process emitter) precisely because the
platform is serverless: two requests may land on different instances, and the table is the only
shared memory they have.

#### Complete CRUD
* **Create** — instruments, VIP tiers and tournaments from UI buttons.
* **Read** — realtime monitoring, fraud clustering by device fingerprint and IP, sharp-trader alerts
  above a configurable win-rate threshold, rapid-fire detection.
* **Update** — user profiles, balances, `custom_yield_ratio`, payouts, feed mapping, tier bonuses,
  tournament windows and platform settings, all on the fly.
* **Delete** — assets, tiers, tournaments (fees refunded), users and log history, with guards that
  refuse only when live positions would be stranded (`?force=1` overrides).

### 7 · Performance architecture (Module 1.2)
* **Edge-first rendering** — the marketing shell is static; the Three.js hero, the logo stage and
  every chart are `next/dynamic({ ssr: false })`, so first paint never waits on WebGL or charting.
* **Two-level cache** (`src/lib/cache.js`) — per-instance memory LRU in front of optional **Upstash
  Redis** over its REST API (set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; no extra
  dependency, and everything degrades silently to memory-only). `/api/health` reports hit rate.
* **CDN caching** — the asset catalogue is served `s-maxage=30, stale-while-revalidate=300`, build
  output is `immutable`, and the streaming endpoints are explicitly `no-transform`/unbuffered.
* **Smaller bundles** — `optimizePackageImports` for framer-motion, lightweight-charts and three.

### 8 · Persistence & deployment
* **PostgreSQL only** — no SQLite anywhere. `src/lib/db.js` speaks plain Postgres through `pg`
  against Neon/Supabase/RDS; the local fallback is PGlite (real Postgres in WASM) running the exact
  same SQL, so nothing changes when you attach a cloud URL.
* **Self-migrating** — schema, indexes, market universe and the owner admin account are created on
  first boot; migrations are idempotent (`ALTER TABLE … IF NOT EXISTS`).
* **Serverless-safe settlement** — expiring trades are settled opportunistically on API traffic
  (throttled once per second per instance) *and* by the Vercel/Render cron hitting `/api/cron/settle`.
* **Read-only filesystems are handled** — Vercel and Lambda mount the deployment directory read-only,
  so `.data/pglite` cannot be created there. `src/lib/db.js` walks a candidate list and falls back to
  the OS temp directory (the one place every host guarantees is writable), so the app boots instead of
  failing. Temp storage is **ephemeral** — `/api/health` reports `"persistent": false` when that is the
  case. Set `DATABASE_URL` for anything real.
* **Failures are legible** — a database that cannot be reached returns **503** with
  `{ code, hint }` instead of a bare `500 Internal server error`, and the bootstrap promise is not
  cached once it fails, so the next request retries and the instance self-heals when the database
  comes back. `/api/health` answers even when the database is down and says exactly why.

---

## 🩺 "Internal server error" on login / signup

That message means the request reached the app but the app could not reach its database. Diagnose in
one call:

```bash
curl https://your-domain/api/health
```

| `db.status` | What it means | Fix |
|---|---|---|
| `ready` | Database is fine — the error is elsewhere. | Check the browser console and the host logs. |
| `failed` + `ECONNREFUSED` / `ENOTFOUND` / `ETIMEDOUT` | `DATABASE_URL` host unreachable. | Verify the host, and that this host is allow-listed by the database firewall. |
| `failed` + `28P01` / `password authentication failed` | Wrong credentials in `DATABASE_URL`. | Re-copy the connection string from the provider dashboard. |
| `failed` + `no SSL` / `SSL` | Provider requires TLS. | Append `?sslmode=require` (Neon/Supabase/RDS all require it). |
| `failed` + `DB_NO_WRITABLE_DIR` | Embedded fallback has nowhere to write. | Set `DATABASE_URL`, or point `PGLITE_DIR` at a writable path. |
| `ready` but `"persistent": false` | Running on ephemeral temp storage. | Set `DATABASE_URL` — otherwise every cold start loses all data. |

Then, once the URL is correct:

```bash
DATABASE_URL="postgres://…" npm run db:init   # creates schema + seeds markets and the owner admin
```

---

## 🔐 First login

The owner account uses a fixed email and a password supplied by the deployment environment:

```
URL       : https://your-domain/nexa-admin-portal/login
Email     : arjumankhan181@gmail.com
Password  : the value of SUPER_ADMIN_PASSWORD (at least 12 characters)
```

There is no built-in owner or staff password. Missing or short `SUPER_ADMIN_PASSWORD` values
prevent owner provisioning and disable an existing owner account at boot. Changing this value
rotates its password and revokes existing sessions on the next database initialization.

Optional `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` provision a secondary **ADMIN**, rather
than a **SUPER_ADMIN**. Its configured password is also synchronized at boot and must be at
least 12 characters. If its email is configured but the password is missing/short, the account
is disabled. Keep these environment values consistent with any intended password change.

Ordinary users sign up and log in at `/signup` and `/login`; their stored passwords are bcrypt
hashes, so the original text cannot be retrieved from the database.

See [the local account audit](docs/ACCOUNT-AUDIT.md) for verified test accounts, panel integration
results and outstanding production configuration.

---

## 🧪 Tests

```bash
npm test
```

* proves a 30 % target converges to a 30 % win rate (≈70 % losses) over 4 000 simulated settlements,
* verifies force-loss, per-user overrides, engine-off passthrough and exit-price consistency,
* covers KYC payload validation, spoof detection and the country/document registry,
* checks every indicator against hand-computed references (SMA/EMA/RSI/MACD/Bollinger),
* asserts the 150+ catalogue is complete, unique and mappable to every upstream provider,
* verifies copy-trade sizing (ratio, fixed, floor and per-trade cap),
* covers auth request validation (field-scoped errors, normalisation, no password reflection)
  and the database error mapping that turns a dead connection into a diagnosable 503.

**36 tests, all passing.**

### Style audits

`npm test` also runs `tests/styled-jsx-scope.mjs`, a static guard against the
styled-jsx scoping trap: styled-jsx appends its scope class only to DOM
elements written inside a component, so a class that is defined in a file's
`<style jsx>` **and** passed as `className` to a custom component (`<Reveal>`,
`<motion.div>` from another file, …) is styled by a rule that can never match.
That bug shipped once and left the whole landing page unstyled while every
route still answered 200.

```bash
npm run check:css        # needs a running dev server
```

`tests/css-coverage.mjs` loads the rendered HTML of each route and asserts that
every selector in `src/styles/landing.css` actually matches a real element
(hover / scrolled-nav / open-menu rules are excluded because static HTML cannot
contain those states). Current result: **90/90 state-independent selectors
match**.

> Note: a headless browser is not available in this repo's CI sandbox, so these
> two audits are the substitute for a visual check. They catch dead rules and
> unstyled elements, but they do not catch layout that is styled *wrongly*.

---

## 📁 Project layout

```
src/
  app/
    page.jsx                     3D landing page
    login | signup               auth screens
    dashboard/                   user terminal (layout, terminal, wallet, kyc, history)
    nexa-admin-portal/           secret admin console (overview, users, kyc, finance, risk, logs)
    api/                         Node.js API routes (auth, market, trades, wallet, kyc, admin, cron)
                                 incl. /api/market/stream (SSE) and /api/auth/{password,activity}
  components/
    three/                       GoldLogo3D, HeroBackground
    landing/                     LogoStage, LiveTicker
    dashboard/                   SessionProvider, TradeChart
  lib/
    db.js                        Postgres/PGlite layer, schema, seed
    auth.js                      JWT cookies, session, security logging
    trading.js                   order placement + settlement pipeline
    riskEngine.js                target win rate, force loss, exit-price adjustment
    market.js                    live quotes & candles (Binance / Finnhub / Polygon / fallbacks)
    assetCatalog.js              the 152-instrument catalogue (crypto/forex/commodity/stock/index)
    symbols.js                   per-provider symbol translation
    finnhubStream.js             server-side Finnhub WebSocket relay (push feed for FX & metals)
    indicators.js                RSI · MACD · Bollinger · SMA · EMA (pure functions)
    realtime.js / realtimeClient.js   platform event bus + useLiveEvents() SSE hook
    social.js / copyMath.js      leaderboard, copy trading, VIP tiers
    tournaments.js               tournament lifecycle, standings and prize payouts
    cache.js                     memory + Upstash Redis response cache
    biometrics.js                face detection, descriptors, liveness challenges
    countries.js                 country → accepted documents
  middleware.js                  route protection & panel separation
legacy/                          the previous TradeNova app, kept for reference
```

---

## ⚖️ Disclaimer

NexaTrade ships an administrative **risk engine** that can deterministically influence trade outcomes
(target win rate, force-loss, per-user overrides), exactly as specified. Operating a live venue with
these controls against real customer funds is regulated in most jurisdictions and may be unlawful if
undisclosed. The operator is solely responsible for legal compliance and for disclosing execution
practices to users. Trading involves substantial risk of loss.

