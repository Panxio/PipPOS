# External audits · Auditorías externas

All free tools, run on **2026-11-08** against the local app only (`127.0.0.1`): the API without test routes and the compiled front served by `vite preview`. Only numbers are kept; the HTML reports are regenerable. *Herramientas gratuitas, ejecutadas el 2026-11-08 solo contra la app local. Se guardan los números, no los informes.*

Before publishing (2026-11-09) the unit tests (API 795, shared 26, front 248) and gitleaks were run again. The scanned code has not changed since 2026-11-08 except comments and the `license` field of each `package.json`, so the other rows were not repeated. *Antes de publicar se repitieron las pruebas unitarias y gitleaks; desde el 2026-11-08 el código escaneado solo cambió en comentarios y en el campo `license`, así que las demás filas no se repitieron.*

| Tool | Scope | Result |
|---|---|---|
| gitleaks | full git history of this project's working repo (96 commits, re-run on 2026-11-09) | 3 findings, all false positives (fictitious passwords inside unit tests) |
| Trivy `fs` | dependencies, secrets, misconfigurations, licenses | 0 vulnerabilities, 0 secrets, 0 misconfigurations; 2 licenses reported UNKNOWN = the two OFL-1.1 fonts |
| Semgrep | owasp-top-ten, typescript, nodejs and jwt rule packs; 85 rules, 172 files | 0 findings |
| OWASP ZAP baseline | compiled front | 0 FAIL, 3 WARN accepted, 65 PASS (was 7 WARN before the fixes below) |
| OWASP ZAP API scan (active) | public API from its OpenAPI document, with a write-scope key | 3,620 requests, none rejected for auth (401), rate limit (429) or server error (5xx); 0 FAIL, 0 WARN, 120 PASS |
| Lighthouse 13 | landing and login | performance 100, accessibility 100, best practices 96, SEO 91 |
| `npm audit` | whole tree | 0 vulnerabilities in production dependencies; 5 moderate in development tooling only (the Stryker mutation-testing chain: `minimatch`, `qs`) |
| CycloneDX SBOM + license-checker | npm dependencies | 63 production components (60 third-party: 52 MIT, 3 BSD-3-Clause, 3 ISC, 2 OFL-1.1); 330 packages in the whole tree, no GPL, AGPL or LGPL |

## What the audits found and was fixed

- The compiled front sent no security headers: it now sends a strict CSP (everything `'self'`, `frame-ancestors 'none'`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP. They apply to `vite preview` only, because a CSP breaks hot reload in `vite dev`. A unit test pins them.
- Under that CSP, zod 4 probed `Function('')` on every load and the browser logged a violation: it now runs in `jitless` mode.
- `favicon.ico` returned 404 and the page had no meta description.

## Accepted, not fixed

- ZAP informational warnings: Cross-Origin-Embedder-Policy (nothing cross-origin to isolate), Cache-Control 10049 (it warns equally with `no-cache` and `no-store`; both were tried) and "Modern Web Application".
- Lighthouse: no `robots.txt`, `llms.txt` or ARD manifest (not applicable to a local demo), and the `401` that `/me` returns before login (the app's session probe).

## Reading these numbers honestly

A scan only counts if the app's log shows its requests. Two "green" results were empty and were discarded: an API scan that reported 120 PASS without sending a single request (the authorization value was split on its space), and `license-checker --production`, which finds 0 packages in an npm-workspaces monorepo. The API scan above sends real example values (a copy of the OpenAPI document with examples), so the charge endpoint was exercised with 1 creation, 20 idempotent replays and 122 conflicts, besides validation errors.
