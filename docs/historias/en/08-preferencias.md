# Preferences: language and theme

Each person chooses the language (Spanish or English) and the theme (light or dark) of the application. They are saved in their account, not in the browser.

### Change the language
**Level:** easy

**As a** user, **I want** to use the application in my language **so that** I understand every screen effortlessly.

- **Given** an open session in Spanish, **when** I change the language to English, **then** the interface texts change in all sections and the menu still has the same sections for my role.
- **Given** the chosen language, **when** I reload the page, **then** it is kept.
- **Given** the chosen language, **when** I sign out and sign in again (even from another browser), **then** the app opens in that language again.
- **Given** that one person changes their language, **when** another person from the same merchant signs in, **then** they see their own: the preference is per user.

**Out of scope:** languages other than Spanish and English, and configurable date formats.

### Change the theme and do not break automation
**Level:** medium

**As a** user, **I want** a light or dark theme **so that** I can work comfortably; and as an automation engineer, **I want** changing it not to move the interface's identifiers.

- **Given** the light theme, **when** I turn on the dark one, **then** the application's colors change immediately and the content and structure stay the same.
- **Given** the chosen theme, **when** I reload the page or sign in again, **then** it is kept.
- **Given** a change of language or theme, **when** I compare the stable identifiers the app puts on every interactive element (see the [README](../../../README.md)), **then** they are the same before and after: they do not depend on the text or the theme.
- **Given** a request to save preferences with a language or a theme that do not exist, or with a missing field, **when** it reaches the API, **then** it is rejected by validation and the saved preferences do not change.
- **Given** a person without a session, **when** they try to save preferences through the API, **then** they get "unauthenticated".

**Out of scope:** custom themes and automatic detection of the operating system's theme.
