# Reports

Only administrators and supervisors see reports. **What counts as a sale:** an approved, partially refunded or fully refunded transaction; its **net** is the amount minus what was refunded. A voided one is not a sale (it is counted separately); a declined or no-response one only counts as an attempt. A transaction falls in the range by its creation date. With the demo data there are about 400 charges spread over the last 30 days, so to reconcile numbers by hand you want a freshly reset merchant (test route described in the [README](../../../README.md)) or ranges with no demo data.

### The summary cards
**Level:** easy

**As a** supervisor, **I want** a summary of the period **so that** I can see how the day is going at a glance.

- **Given** a freshly reset merchant with four charges today: a $10.000 sale, a $4.000 sale with $1.000 refunded, a $6.000 sale that was voided and a $2.000 decline, **when** I look at "Today", **then** the cards show: net sales $13.000, 2 sales, average ticket $6.500, 4 attempts, approval 75,00 % and 1 void for $6.000.
- **Given** the rule above, **when** I calculate approval by hand, **then** it is (sales + voided) ÷ attempts, truncated to two decimals: a voided sale was approved at the time.
- **Given** a period with no sales, **when** I look at the cards, **then** the average ticket is $0 and there are no division errors.
- **Given** a period with no previous period that has data to compare against, **when** I look at the change, **then** it shows "—" and not an invented percentage.
- **Given** the quick ranges (today, 7 days, 30 days, current month), **when** I pick one, **then** the range and the cards change; "Current month" includes today.

**Out of scope:** other currencies, and reports by branch.

### Group the sales and export them
**Level:** medium

**As a** supervisor, **I want** to see sales grouped and download them **so that** I can reconcile them with another spreadsheet.

- **Given** a range of several days, **when** I group by day, **then** every day in the range appears, including days with zero sales, in chronological order, and the chart has an equivalent table as an accessible alternative.
- **Given** the same range, **when** I group by hour, **then** all 24 hours always appear, adding up all the days.
- **Given** grouping by terminal, cashier, payment method or brand, **when** I look at it, **then** only groups with sales appear, each with a readable label (terminal alias, cashier name) and sorted from highest to lowest net amount.
- **Given** any grouping, **when** I add up the rows, **then** the total and the number of sales match the summary cards for the same range.
- **Given** a grouped view, **when** I download the CSV, **then** the file is named `ventas-<groupBy>-<from>-<to>.csv` (the name is not translated), its header is `key,label,sales,totalNet`, every line (the last one included) ends in CRLF and it has exactly the rows of the view.
- **Given** a label that starts with `=`, `+`, `-` or `@` (for example a terminal alias), **when** the CSV is downloaded, **then** the cell comes out with an apostrophe in front so that a spreadsheet does not execute it; commas and quotes are escaped according to the usual CSV format.

**Out of scope:** exporting to Excel or PDF and scheduling deliveries.

### Ranges, time zone and permissions
**Level:** hard

**As a** person who reconciles, **I want** the range limits and the permissions to be precise **so that** I can trust the figures.

- **Given** a custom range, **when** the "from" is later than the "to", or the range exceeds 366 days, **then** the screen warns, the download button is disabled and the API responds with a validation error.
- **Given** a sale created in the very first or the very last millisecond of the range, **when** I query, **then** it is included; one created a millisecond before or after is not.
- **Given** that the browser is in a time zone other than UTC, **when** I group by day or hour, **then** the days and hours are the local ones of the person looking, not the server's.
- **Given** that I turn on the comparison, **when** there is a previous period with sales, **then** each card shows its percentage change against that period.
- **Given** a cashier, **when** they try to open reports, **then** they do not have the section and the API responds "forbidden"; a supervisor sees the section and its cards just like an administrator.

**Out of scope:** daylight-saving changes inside the range (a fixed offset is applied) and ranges longer than a year.
