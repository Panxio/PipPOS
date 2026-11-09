# AGENTS.md

Notes for AI coding agents (and people) who fork this project.

## What this is
PipPOS is a demo back-office for contactless POS terminals, meant as a system under test. Fictitious money, `127.0.0.1` only. Read [README.md](README.md) first.

## Layout
- `api/` Fastify 5 + `node:sqlite` + Zod. `src/domain/` is pure (no imports of fastify, node:sqlite, zod, `Date` or `Math.random`); `src/application/` holds use cases and ports (TS interfaces); `src/adapters/` holds HTTP, persistence, the simulated switch and clocks. Dependencies point inwards only.
- `front/` React 19 + Vite + Tailwind 4. `shared/` holds the Zod contracts. There is no end-to-end suite in this repository on purpose (it would be the answer key for the exercises in `docs/historias/`); anything you write for it should only know the app over HTTP and `data-testid`.

## Rules that keep it honest
- Money is integer minor units (`bigint`) and a decimal string in JSON. Never a `number`.
- No `any`. Business errors carry a typed code. Keep functions short and names explicit.
- Every interactive element keeps a stable `data-testid` from `front/src/testids.ts`; add the id there and to `front/test/testids.test.ts`. Do not drive tests through text or CSS.
- There are no planted vulnerabilities and no on/off flags for them. Security work means tests against the secure product, only on your own machine.
- Do not weaken a test to make it pass. If a test fails, fix the code, or say the specification is wrong.

## Commands
```bash
npm ci
npm test && npm run typecheck                 # api, shared, front
npm run dev -w api   &   npm run dev -w front # 127.0.0.1:3100 and 127.0.0.1:5173
```
Security headers for the compiled front live in `front/vite.config.ts` (`preview` only); an automation suite is best run against `vite dev`.
