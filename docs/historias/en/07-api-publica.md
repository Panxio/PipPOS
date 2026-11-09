# Public API

An API for automating without an interface (Postman, Karate, k6, your own client). It lives at `/public/v1` and its contract at `/public/v1/openapi.json` (open, no key). It authenticates with `Authorization: Bearer <key>`. Keys are created by an administrator from the web session (`POST /api/v1/api-keys` with a name of 1 to 60 characters and the scope `read` or `write`); the keys screen does not exist, which is why it is part of the exercise. Each merchant only sees its own data.

### Create a key and read with it
**Level:** easy

**As an** integrator, **I want** a read key **so that** I can query terminals, transactions and reports from my own program.

- **Given** an administrator with a session, **when** they create a key, **then** the response carries the full key only once; afterwards only its name, scope, prefix and dates are listed, never the secret. A supervisor or a cashier gets "forbidden".
- **Given** a valid key, **when** I query terminals, one terminal, the summary or the grouped sales of reports, or a transaction, **then** I receive the same data shape and the same amounts the web application shows, for the whole merchant.
- **Given** a missing, malformed, made-up or revoked key, **when** I query any route, **then** I receive "unauthenticated" with exactly the same body in every case.
- **Given** a web session cookie, **when** I use it on the public API, or a key on the web API, **then** it is not valid in either direction.
- **Given** a key I have just revoked, **when** I use it again, **then** it stops working immediately.
- **Given** the OpenAPI contract, **when** I download it without a key, **then** it lists the public routes and the `Bearer` authentication scheme.

**Out of scope:** voiding, refunding, managing users or keys and the test routes through the public API: those routes do not exist there (404).

### Walk through the transactions with a cursor
**Level:** medium

**As an** integrator, **I want** to paginate the transaction list **so that** I can fetch all of them without repeating or skipping any.

- **Given** a list with filters for status, payment method, brand, terminal, dates and amounts, **when** I combine them, **then** only the transactions that meet all of them come back, the most recent first.
- **Given** a `limit` from 1 to 100 (20 if I do not give one), **when** I query, **then** I receive up to that number of items and an opaque cursor for the next page; on the last page the cursor is null, also when the `limit` is exactly the total.
- **Given** a walk in progress, **when** new charges come in between one page and the next, **then** the walk does not repeat or skip rows already seen.
- **Given** a `limit` out of range, an invalid cursor or an unknown parameter, **when** I query, **then** I receive a validation error.
- **Given** the identifier of a transaction that does not exist (or belongs to another merchant), **when** I query it, **then** I receive "not found" with no distinction between the two cases.

**Out of scope:** sorting by another field and jumping to a page by number.

### Charge with idempotency and respect the usage limit
**Level:** hard

**As an** integrator, **I want** to charge through the API without duplicating charges on a retry **so that** a network outage does not charge twice.

- **Given** a read-only key, **when** I try to charge, **then** I receive "forbidden"; with a write key, the charge works with the same fields and rules as the web (active terminal, amount, brand, method and last 4 digits), but without its own request identifier.
- **Given** a charge, **when** the `Idempotency-Key` header is missing or is not a UUID, **then** it is rejected by validation.
- **Given** the same `Idempotency-Key` and the same body, **when** I retry, **then** I receive the same transaction with a different status code than the first submission (created the first time, OK afterwards) and a second one is not created. With the same `Idempotency-Key` and a different body I receive a conflict. With two simultaneous submissions with the same key, only one is created.
- **Given** a card whose ending causes a decline or no response, **when** I charge, **then** the response is still "created" and the transaction's status says what happened.
- **Given** a key, **when** it exceeds 60 requests in a minute, **then** the following ones receive "too many requests" with the `Retry-After` header; a different key is not affected.
- **Given** any public API error, **when** I review the body and the logs, **then** the body carries a correlation identifier and the key does not appear anywhere.

**Out of scope:** webhooks, and batch charges.
