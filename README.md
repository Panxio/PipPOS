# PipPOS

**A back-office portal for contactless POS terminals, built as a system under test (SUT) for practising test automation.** Terminals, users with roles, a live transaction feed, reports, alerts, an audit log and a small public API. All money is fictitious and everything listens on `127.0.0.1` only.

[Español](README.es.md) · License: MIT · Status: **demo, not for production**

## What it does

- **Terminals:** list with search, filters and sorting; create, edit, enable/disable, CSV import.
- **Users and roles:** `admin`, `supervisor` and `cajero` (cashier), branches, e-mail style invitations, account lock after failed logins, password change.
- **Transactions:** charge flow against a simulated card switch, live feed, filters, void and refund, printable receipt.
- **Reports:** summary and sales over a date range, grouped by day, hour, terminal, cashier, method or brand; CSV export.
- **Alerts and audit log:** thresholds, a notification bell, an append-only audit trail.
- **Public API** (`/public/v1`, OpenAPI at `/public/v1/openapi.json`) with `read`/`write` API keys, idempotent charges and rate limiting.
- Spanish and English, light and dark theme, and a public landing page.
- "Liquidaciones" (settlements) is a placeholder screen on purpose.

## Why it exists

It is a realistic app with something to automate everywhere: forms, tables, roles, async feeds, a wizard, file import/export. Every interactive element carries a stable `data-testid` (see [`front/src/testids.ts`](front/src/testids.ts)), so a suite written in Playwright, Selenium, Cypress or Karate does not depend on texts or CSS. For practice there are [user stories](docs/historias/en/README.md) (also [in Spanish](docs/historias/README.md)) with given / when / then criteria per module. The author's end-to-end suite is **not published** (it would be the answer key): you write yours, with the framework you prefer.

## Run it

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev -w api      # API on http://127.0.0.1:3100 (SQLite file in api/data, demo data on first start)
npm run dev -w front    # front on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173/ingresar. Demo accounts (fictitious, created by the seed): `admin@pippos.test`, `supervisor@pippos.test` and `cajero@pippos.test`, all with the password `demo-pippos-2026`.

API environment variables: `PORT`, `DB_PATH` (`:memory:` works), `ALLOWED_ORIGINS`, `LOGIN_RATE_MAX`, `PUBLIC_RATE_MAX`, and `ENABLE_TEST_ROUTES=1`, which adds `/__test__/*` routes for automation suites (all `POST`, no session). Never enable the test routes outside your machine.

| Test route | What it does |
|---|---|
| `/__test__/reset` | Wipes everything, restores the demo data and puts the clock back to zero |
| `/__test__/seed` | Restores the demo data without wiping the rest |
| `/__test__/clock` with `{"advanceMs": n}` | Moves the server clock forward n milliseconds (expiring sessions, account lockout) |
| `/__test__/transactions` | Inserts an already-resolved transaction (status, amount and date of your choice), bypassing the switch |
| `/__test__/terminals/:id/telemetry` with `{"connection"?, "batteryPct"?}` | Changes a terminal's connection or battery |

## Tests

```bash
npm test                # api, shared and front (Vitest)
npm run typecheck
```

Re-measured on 2026-11-13: API 851, shared 26, front 255 unit/integration tests, all passing.

## Security checks

The product is secure by design (no planted vulnerabilities, no feature flags); the security work is *testing* it. A role × endpoint matrix of 205 tests, plus free external audits run against the local app. Numbers and how they were measured: [`docs/auditorias/`](docs/auditorias/README.md).

## Architecture

`api/` Fastify 5, `node:sqlite` and Zod, in a light hexagonal layout (pure `domain/`, use cases and ports in `application/`, `adapters/` at the edge); `front/` React 19, Vite and Tailwind 4; `shared/` the Zod contracts both sides use. Money is integer minor units (`bigint`), a decimal string in JSON, never a `number`.

## Credits

Fonts: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and [IBM Plex Mono](https://www.ibm.com/plex/), both under the SIL Open Font License 1.1, via `@fontsource`. Released under the [MIT License](LICENSE).
