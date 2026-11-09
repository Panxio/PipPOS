# Transactions

Charging talks to a **simulated** card switch: its response depends only on the last 4 digits. Ending in `0051`: declined for insufficient funds (code 51). Ending in `0005`: declined, do not authorize (code 05). Ending in `0408`: the switch does not respond. Any other ending: approved (code 00). Amounts are whole pesos, with no decimals (on screen `$2.500`).

### Charge and see the result
**Level:** easy

**As a** cashier, **I want** to charge with a card or wallet on an active terminal **so that** I know right away whether the payment was approved.

- **Given** an active terminal, **when** I charge a card whose ending is not special, **then** the result says "approved", with code 00, a 6-digit authorization code and a sequential folio.
- **Given** the endings `0051` or `0005`, **when** I charge, **then** the result says "declined" with its code (51 or 05) and without an authorization code.
- **Given** the ending `0408`, **when** I charge, **then** the result says "no response", with neither a response code nor an authorization code.
- **Given** the three results above, **when** I look at the list, **then** all three appear with their folios, the most recent first. A decline is a result of the charge, not an app error.
- **Given** an amount outside 1 to 99.999.999, with leading zeros or with decimals, or last digits that are not four numbers, **when** I submit the charge, **then** it is rejected by validation and nothing is created.
- **Given** an inactive terminal, **when** I try to charge, **then** it is rejected and no transaction is created.

**Out of scope:** real charges, tips, installments and currencies other than the peso.

### Filter the feed and open the detail and the receipt
**Level:** medium

**As a** supervisor, **I want** to review the merchant's transactions with filters **so that** I can find a specific sale and hand over its receipt.

- **Given** transactions of several statuses, brands and amounts, **when** I filter by status, brand, minimum or maximum amount, **then** I see only those that match; combining filters requires all of them at once and the amount limits are inclusive.
- **Given** the open list, **when** a new transaction comes in (for example, a charge from somewhere else), **then** it appears without me reloading or touching anything, after a few seconds.
- **Given** a transaction's detail, **when** I open it, **then** I see its status, amounts, brand, last 4 digits and the history of events (created, voided, refunded) in order.
- **Given** an approved, voided or refunded transaction, **when** I open its receipt, **then** it opens in a separate tab, without the app's frame, with folio, merchant, terminal, amount, status and the last 4 digits (never the full card).
- **Given** a declined or no-response transaction, **when** I look at its detail, **then** it offers no receipt and requesting it through the API responds with a conflict.
- **Given** a cashier, **when** they query the list, the detail or the receipt, **then** they only access what they charged themselves; another person's identifier responds "not found" and not "forbidden".

**Out of scope:** free-text search, exporting the feed and reprinting receipts from another merchant.

### Void, refund and do not charge twice
**Level:** hard

**As a** supervisor, **I want** to void or refund sales with clear rules **so that** I can correct mistakes without the money not adding up.

- **Given** a charge sent twice in a row (double click or a retry with the same request identifier), **when** it arrives, **then** a single transaction is created, with a single folio; the retry returns the same one. Reusing the identifier with a different body responds with a conflict. Two simultaneous requests with the same identifier still create only one.
- **Given** an approved sale, with no refunds and less than 24 hours old, **when** I void it and confirm, **then** it becomes "voided" and no longer offers voiding or refunding.
- **Given** an approved sale more than 24 hours old, or one that already has refunds, **when** I try to void it, **then** it is rejected with a conflict and remains approved (or partially refunded).
- **Given** an approved sale, **when** I refund a part, **then** it becomes "partially refunded" with the accumulated refunded amount; when I refund the rest, it becomes "refunded" and accepts no more.
- **Given** a refund greater than what remains to be refunded, or on a voided, declined or no-response sale, **when** I submit it, **then** it is rejected with a conflict and the amounts do not change. At no point does the refunded amount exceed the charged amount.
- **Given** a cashier, **when** they look at a sale, **then** they have no void or refund controls and the API responds "forbidden" if they try.

**Out of scope:** chargebacks, refunds to another card and reverting a void.
