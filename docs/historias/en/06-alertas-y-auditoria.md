# Alerts and audit

Administrators and supervisors see the alerts; only the administrator sees the audit log. With the demo data there is the terminal "Terraza", offline and at 12 % battery, so on day one there are already two open alerts. To change a terminal's battery or connection use the telemetry test route described in the [README](../../../README.md).

### The bell and unread alerts
**Level:** easy

**As a** supervisor, **I want** a bell with the pending alerts **so that** I find out about problems without having to look for them.

- **Given** the open alerts, **when** I enter the app, **then** the bell shows a counter with the unread ones and the panel lists them with their text, the most recent first.
- **Given** an unread alert, **when** I mark it as read, **then** the counter goes down by one and the alert shows as read in the panel.
- **Given** several unread alerts, **when** I use "mark all", **then** the counter disappears.
- **Given** that one person marks an alert as read, **when** another person with access looks at theirs, **then** for them it is still unread: reading is per user.
- **Given** a cashier, **when** they enter, **then** they have no bell and no alerts section, and querying alerts through the API responds "forbidden".

**Out of scope:** notifications outside the app (email, push) and muting alerts.

### Thresholds and when an alert is born or resolved
**Level:** medium

**As an** administrator, **I want** to define the thresholds that trigger alerts **so that** the notices fit my operation.

- **Given** the default thresholds (battery below 20 % and voids from $100.000), **when** I open the thresholds tab, **then** I see those values; as a supervisor I see them disabled and without a save button, and the API rejects my attempt to change them with "forbidden".
- **Given** the thresholds form, **when** I save a battery from 1 to 99 and a positive amount, **then** they are saved and the confirmation appears; with 0, 100 or an amount of zero or with decimals, the API responds with a validation error and saves nothing.
- **Given** an active terminal with the battery strictly below the threshold, **when** it is evaluated, **then** there is a low-battery alert; with the battery equal to the threshold there is none.
- **Given** an open battery alert, **when** the administrator lowers the threshold below the battery level, **then** the alert becomes "resolved"; if telemetry with a low battery arrives afterwards, a new alert is born and the bell counts it.
- **Given** an active terminal that is offline, **when** it is evaluated, **then** there is an "offline" alert; an inactive terminal generates no alerts. There are never two open alerts for the same cause and the same terminal.
- **Given** the void threshold, **when** a sale of that amount or more is voided, **then** an alert is born with the sale's folio; a refund, however large, does not alert, and changing the threshold does not create alerts for earlier voids.

**Out of scope:** per-terminal thresholds and alerts by email.

### The audit log
**Level:** hard

**As an** administrator, **I want** a log that cannot be altered **so that** I know who did what and when.

- **Given** sensitive actions (sign-in, failed sign-in, user creation and changes, password change, terminal creation, editing and import, voids and refunds, threshold changes, API key creation, revocation and rotation), **when** they succeed, **then** each leaves an entry with a sequence number, instant, who did it, action, affected object and detail. Charging, listing and querying leave no entry.
- **Given** a failed sign-in for an email that exists, **when** I review the log, **then** there is an entry, and nowhere (detail or CSV) does the password, a key or a token appear. For an email that does not exist nothing is recorded.
- **Given** the log, **when** I filter by action, actor, object type, object or date range, **then** the filters combine with "and", the total reflects the filter and the order is from most recent to oldest.
- **Given** an applied filter, **when** I download the CSV, **then** the file has the same rows, without pagination (up to 5.000), with the header `seq,atMs,actorId,actorName,action,entityType,entityId,detail` and CRLF line endings; its name carries the literal word `todo` where the from or the to is missing.
- **Given** the log, **when** someone tries to modify or delete entries through the API (PUT, PATCH or DELETE), **then** the route does not exist (404): the log only accepts additions.
- **Given** a supervisor, **when** they try to view the log, **then** the tab does not exist and the API responds "forbidden".

**Out of scope:** log retention or archiving and recording read queries.
