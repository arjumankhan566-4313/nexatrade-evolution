# TRADEON — frontend surface

Marketing/onboarding surface for TRADEON, built inside the existing V2 client.
It is **frontend only**: nothing here changes the canvas chart, the Micro-JSON
parser, the socket layer, the API or the database.

## Brand

The lockup is `components/TradeonLogo.tsx` (monogram + wordmark from
`public/brand/`). **The subtitle "SMART TRADING. ALWAYS ON." is hero-only** —
`showTagline` must stay false in the header, footer and every other surface.
Brand artwork lives in the **repository-root** `public/brand/`, because
`vite.config.ts` points `publicDir` at `VITE_PUBLIC_DIR` (the root `public/`
mounted at `/market-public`), NOT at `platform-v2/client/public/`. Adding a file
there does nothing; adding one to the root `public/` needs a `v2-client`
restart before the dev server serves it.

## Running

The app is part of the normal compose stack — no extra step:

```bash
docker compose -f docker-compose.base44.yml up -d --build
# preview: http://localhost:3000/        (Apex landing)
#          http://localhost:3000/status  (Module-1 wiring smoke page)
```

After changing `package.json` (e.g. the Tailwind toolchain) restart the client so
`npm ci` syncs the mounted `node_modules` volume:

```bash
docker compose -f docker-compose.base44.yml restart v2-client
```

## Tailwind without preflight

Tailwind v4 is imported in `src/apex/styles/apex.css` as `theme` + `utilities`
layers **only**. Preflight is deliberately excluded so the existing terminal,
chart and admin CSS is never reset. Apex tokens are declared with `@theme`
(`--color-apex-*`, `--radius-apex`, `--font-apex`) and plain custom properties
for glass fills, so the Apex surface and the legacy tokens share one palette.

## Claim display

A claim is only shown as a fact when `verified: true` **and** it has a measured
`value`; anything else renders as "Not measured yet" — never badge, never
estimate. Claims live in `MARKETING_CLAIMS`; add measurements there, never
inline in a component.

## Swapping a mock provider for real data

Providers are the only data source the UI reads. Contracts live in
`src/apex/providers/types.ts`; the active implementation is chosen in
`src/apex/providers/index.ts`.

| Interface             | Mock today                                                                                                                        | To go live                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIAssistantProvider` | `providers/mock/ai.ts` — canned sentiment + scripted streaming replies                                                            | Implement `ask()` / `getSentiment()` against your model API and swap the factory in `providers/index.ts`, then set `source: 'live'`. The widget needs no change. |
| `MetricsProvider`     | **live** — `providers/live/metrics.ts` reads `/api/health/otc` (engine uptime, ticks, instruments streaming, measured round-trip) | Already real. A field the API does not return stays `null` and the tile reads "—".                                                                               |
| `MarketProvider`      | **live** — `providers/live/market.ts` reads `/api/market/otc/payouts`                                                             | Already real. Backs the payout chips on the copy-trading leader cards.                                                                                           |

Nothing else changes: components import from `src/apex/providers`, never from a
mock file directly.

## Feature 4 — the verifier is real

`src/apex/lib/provablyFair.ts` computes actual digests with the Web Crypto API:

```
commitment = SHA-256(serverSeed)
settlement = HMAC-SHA256(key = serverSeed, message = `${clientSeed}:${nonce}`)
```

For the shipped sample seeds the settlement digest is
`075fa50ce8d3f5dc47ba396806c2c57c4f372892b0bb179d1f17454be0a5d846`. Hashing
happens in the browser; no value is pre-baked and nothing is sent anywhere.

## Structure

```
src/apex/
  components/   glass/tilt primitives, spatial background
  config/       content.config.ts — claims, disclaimers, samples, pillars
  features/     ai-assistant/, transparency/
  hooks/        useResource (loading / ready / error + retry)
  lib/          provablyFair.ts (Web Crypto)
  pages/        ApexLandingPage
  providers/    types.ts, index.ts, mock/
  styles/       apex.css — tokens, glass utilities, motion fallbacks
```
