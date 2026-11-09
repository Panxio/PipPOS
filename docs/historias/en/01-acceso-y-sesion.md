# Sign-in and session

Demo accounts (fictitious, created by the seed): `admin@pippos.test`, `supervisor@pippos.test` and `cajero@pippos.test`, password `demo-pippos-2026`. To move the server clock and return to the starting data, use the test routes described in the [README](../../../README.md).

### Sign in and see only what my role allows
**Level:** easy

**As a** portal user, **I want** to sign in with my email and password **so that** I work only with the sections my role allows.

- **Given** an administrator, a supervisor and a cashier with valid credentials, **when** each one signs in, **then** they see the merchant name and their role, and their menu has exactly these sections: administrator, seven (home, terminals, users, transactions, reports, alerts and settlements); supervisor, five (home, terminals, transactions, reports and alerts); cashier, two (home and transactions).
- **Given** a wrong password for an existing email and an email that does not exist, **when** a sign-in is attempted with each, **then** the message and the response are indistinguishable: the app does not reveal whether the email exists.
- **Given** an open session, **when** the person signs out, **then** they return to the sign-in screen and the previous session is no longer valid for querying anything.
- **Given** a successful sign-in, **when** the session cookie is inspected, **then** it cannot be read from page scripts and is not sent on requests from other sites.

**Out of scope:** password recovery, social sign-in and two-step verification (they do not exist).

### Account lockout after failed attempts
**Level:** medium

**As a** merchant administrator, **I want** an account to be locked after several failed attempts **so that** password guessing is stopped.

- **Given** an active account, **when** three passwords in a row are wrong, **then** all three failures respond like any incorrect password and the account is locked for 15 minutes.
- **Given** a locked account, **when** a sign-in is attempted with the correct password before the 15 minutes have passed, **then** the sign-in is rejected with an account-locked notice and the period is not extended.
- **Given** a locked account, **when** the 15 minutes pass, **then** signing in with the correct password works.
- **Given** an account with one or two accumulated failures, **when** the person signs in successfully, **then** the count goes back to zero.
- **Given** an unknown email, an invited account that never set a password, or a deactivated account, **when** many attempts fail, **then** the lockout notice never appears (only the credentials error).

**Out of scope:** manual unlocking by an administrator (it does not exist).

### Attempt limit, expiring session and suspicious requests
**Level:** hard

**As a** merchant security person, **I want** access to resist abuse and old sessions **so that** the risk of someone getting in without permission is reduced.

- **Given** a single source address, **when** it sends more than five sign-in requests in a minute (good or bad), **then** the following ones respond "too many requests" until the window passes.
- **Given** an open session, **when** more than 8 hours pass, **then** the next action leads to the sign-in screen with a session-expired notice, and API queries respond "unauthenticated".
- **Given** a request that changes data with an `Origin` header from another site, **when** it reaches the API, **then** it is rejected with "origin not allowed"; without an `Origin` header (a non-browser client) it goes through.
- **Given** a missing, empty or made-up cookie, **when** asking who the signed-in person is, **then** the response is "unauthenticated", always with the same error body.
- **Given** a route that does not exist, **when** it is requested, **then** the response is a 404 with no internal traces and with a correlation identifier.
- **Given** any API response, **when** its headers are reviewed, **then** it carries the usual security headers and no header that gives away the framework.

**Out of scope:** traffic encryption (the demo listens only on `127.0.0.1`) and sign-out on inactivity.
