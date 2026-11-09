# Terminals

With the demo data there are three terminals for the merchant "Boliche La Noche": two active and one inactive. Only administrators and supervisors see the section; writing (creating, editing, activating, importing) is the administrator's job.

### Find a terminal in the list
**Level:** easy

**As a** supervisor, **I want** to search, filter and sort terminals **so that** I can find one quickly and see its status.

- **Given** the terminal list, **when** I type part of the serial or the alias (regardless of upper or lower case), **then** I see only the matching ones; the branch is not part of the search.
- **Given** the list, **when** I filter by active or inactive status, **then** I see only those with that status and the total reflects the filter.
- **Given** that I change the order (serial, alias, branch or creation date, ascending or descending), **when** the list reloads, **then** the rows follow that order and pagination goes back to the first page.
- **Given** more than 20 terminals, **when** I go through the pages, **then** each page brings up to 20 rows and the previous and next buttons are disabled at the ends.
- **Given** a filter with no matches, **when** it is applied, **then** the list shows the empty state and not an error.
- **Given** a cashier, **when** they look at their menu, **then** it has no terminals section.

**Out of scope:** searching by branch or model, and sorting by more than one column at a time.

### Create, edit and deactivate
**Level:** medium

**As an** administrator, **I want** to create, edit and deactivate terminals **so that** the fleet of devices stays up to date.

- **Given** the creation form, **when** I submit a valid serial, alias, model, branch and till, **then** the terminal appears in the list, active, and the total goes up by one.
- **Given** a serial with spaces or in lower case, **when** I submit it, **then** it is saved without spaces and in upper case; a serial shorter than 6 or longer than 20 characters, or with symbols other than letters, numbers and hyphen, is rejected with a validation error.
- **Given** a serial that already exists (even if I type it with different capitalization), **when** I try to create it, **then** I see an error, the form stays open and nothing is created.
- **Given** a terminal, **when** I edit the alias, branch or till, **then** the detail and the list show the new values; the serial cannot be edited.
- **Given** an active terminal, **when** I ask to deactivate it, **then** the app asks for confirmation; if I cancel, the status does not change; if I accept, it becomes inactive, also after reloading the page. Activating an inactive terminal does not ask for confirmation.
- **Given** an inactive terminal, **when** someone tries to charge with it, **then** the charge is rejected with a conflict.
- **Given** a supervisor, **when** they try to write (through the screen or directly through the API), **then** there are no controls to do so and the API responds "forbidden".

**Out of scope:** deleting terminals (they are only deactivated) and editing the model.

### Import terminals from a CSV
**Level:** hard

**As an** administrator, **I want** to load many terminals at once from a CSV file **so that** I do not have to create them one by one.

- **Given** a CSV with the exact header `serial,alias,model,branch,till`, **when** I import it, **then** the valid rows are created and the result reports how many were created.
- **Given** a mixed CSV, **when** I import it, **then** the invalid rows do not stop the others and the result lists them with the file's line number (the header is line 1) and the reason: invalid serial, repeated serial (against the database or against an earlier accepted row of the same file), missing field, field too long or unsafe value.
- **Given** a text value that starts with `=`, `+`, `-` or `@`, **when** I import it, **then** that row is rejected as an unsafe value (this prevents spreadsheet formulas).
- **Given** quoted values with commas inside and CRLF line endings, **when** I import them, **then** they are read as a single field and created correctly.
- **Given** a file without the exact header or with more than 500 data rows, **when** I import it, **then** it is rejected as a whole with a validation error and nothing is created.
- **Given** a finished import, **when** I go back to the list, **then** the total and the rows already include the created terminals and I can import another file right away.
- **Given** a supervisor, **when** they try to import, **then** they do not have the control and the API responds "forbidden".

**Out of scope:** importing other formats (Excel, JSON) and undoing an import.
