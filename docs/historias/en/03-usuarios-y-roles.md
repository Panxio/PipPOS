# Users and roles

Only the administrator manages users, branches and tills. With the demo data there are three users (one per role) and two branches (Centro with two tills and Norte with one). There is no real email: invitations arrive in a simulated inbox inside the app itself.

### View users and organize branches and tills
**Level:** easy

**As an** administrator, **I want** to see the merchant's people and organize their branches and tills **so that** I can assign each cashier a place to work.

- **Given** the users section, **when** I enter as an administrator, **then** I see each person with their name, email, role, status (invited, active or inactive) and the branch they belong to (empty if none).
- **Given** the branch form, **when** I create a branch and then a till inside it, **then** both appear in the branch list and are available to assign.
- **Given** a branch that already exists, **when** I try to create another with the same name (regardless of capitalization), **then** I see an error and the list does not change; the same goes for a repeated till within the same branch.
- **Given** a supervisor or a cashier, **when** they try to open the users section (through the screen or directly through the API), **then** they do not have it or they get "forbidden". The supervisor can query the branch list; the cashier cannot.

**Out of scope:** renaming or deleting branches and tills, and changing an existing user's role from the screen.

### Invite a person and their first sign-in
**Level:** medium

**As an** administrator, **I want** to invite a new person **so that** they set their own password and start working with the right role.

- **Given** the creation wizard, **when** I complete name, email, role and (if the role is cashier) branch, **then** I see a summary before confirming and, once confirmed, the person is "invited" and a message with a link arrives in the inbox.
- **Given** a cashier without a branch, **when** I try to move forward, **then** the wizard does not let me; for supervisor and administrator the branch is optional.
- **Given** an email already used by another person (even with different capitalization or spaces), **when** I try to invite, **then** it is rejected with a conflict and nothing is created.
- **Given** the invitation link, **when** the person opens it and sets a password of 10 to 128 characters with at least one letter and one number, **then** their status becomes "active" and they can sign in with it, seeing only the sections of their role. A weaker password is rejected.
- **Given** a link that was already used, expired (more than 48 hours) or made up, **when** it is opened and a password is submitted, **then** it fails with the same "not found" error and nothing changes.
- **Given** an invited person, **when** the administrator resends the invitation, **then** a new message arrives in the inbox and the previous link stops working. Resending is only available while the person is still invited.

**Out of scope:** sending real emails and password rules other than those described.

### Deactivate users and change my password
**Level:** hard

**As an** administrator, **I want** to deactivate accounts and have each person change their own password **so that** access can be cut without leaving the merchant without an administrator.

- **Given** an active user, **when** the administrator deactivates them, **then** the app asks for confirmation; once accepted, the user becomes "inactive" (also after reloading), their open sessions stop being valid and their sign-in fails just like with a wrong password.
- **Given** the administrator themself, **when** they try to deactivate themself or change their own role, **then** the API rejects it with a conflict and their user's row does not offer those controls: there is always at least one administrator.
- **Given** a deactivated user who is activated again, **when** they had already set a password, **then** they become "active"; if they never set one, they go back to "invited".
- **Given** a person with a session, **when** they change their password by giving the current one and a valid new one, **then** they go back to the sign-in screen with a notice, the old password no longer works, the new one does and all their other sessions are closed.
- **Given** the password change, **when** the current one is wrong, **then** it responds "invalid credentials" and nothing changes; if the new one is weak or the same as the current one, it fails validation.

**Out of scope:** resetting another person's password and password history.
