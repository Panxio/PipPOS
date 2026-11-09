# User stories

Exercises for practicing test automation (QA Automation / QA Engineer) on PipPOS. Each story describes **what the product must do**, not how to test it: you choose the framework (Playwright, Selenium, Cypress, Karate, Postman, k6…), the structure and what to automate. There is no reference solution in this repository: the author's end-to-end test suite is not published, because it would be the answer key.

To start the app and find the demo accounts and the test routes (reset data, move the clock, inject telemetry), see the [README](../../../README.md).

Spanish version: [Historias de usuario](../README.md).

## Modules

| Module | Stories | Levels |
|---|---|---|
| [Sign-in and session](01-acceso-y-sesion.md) | 3 | easy · medium · hard |
| [Terminals](02-terminales.md) | 3 | easy · medium · hard |
| [Users and roles](03-usuarios-y-roles.md) | 3 | easy · medium · hard |
| [Transactions](04-transacciones.md) | 3 | easy · medium · hard |
| [Reports](05-reportes.md) | 3 | easy · medium · hard |
| [Alerts and audit](06-alertas-y-auditoria.md) | 3 | easy · medium · hard |
| [Public API](07-api-publica.md) | 3 | easy · medium · hard |
| [Language and theme preferences](08-preferencias.md) | 2 | easy · medium |

## How to read a story

- **Level.** *Easy*: a direct flow with demo data. *Medium*: several states, roles or data you have to set up. *Hard*: time, concurrency, files, cross-role permissions or edge rules.
- **Criteria.** Each one follows the *Given / when / then* form and describes an observable behavior. Turning it into a test (or deciding it is not worth it) is your job.
- **Out of scope.** What the app does not do. Do not test it as if it should exist.
- **Numbers.** Amounts are whole Chilean pesos, shown with a dot as thousands separator (`$2.500`), and percentages with a decimal comma (`75,00 %`), exactly as on screen.
- If a criterion and the app disagree, do not tweak your test until it passes: write the difference down and treat it as a finding (or as a question about the specification).

## Quality self-assessment checklist

Before calling a solution done, review:

- [ ] **Independent tests.** Each one prepares its own data and can run alone, in any order and in parallel; none depends on what another left behind.
- [ ] **Data through the API, not the screen.** Anything that is not what you are testing (creating a user, a sale, a terminal) is set up through the API or with the test routes; the screen is reserved for what you verify.
- [ ] **No fixed waits.** No `sleep` and no fixed pauses: you wait on observable conditions (an element, a response, a state change). The clock moves with the test route, not with real waiting.
- [ ] **Stable locators.** You use the app's stable identifiers (see the README), not texts or styles, so your tests survive a change of language or theme.
- [ ] **Coverage by role.** Every important permission is tested at least from a role that has it and one that does not; the negative case is as much part of the criterion as the positive one.
- [ ] **The test can fail.** You saw each new test go red (by deliberately breaking the product or the data) before trusting that it is green.
- [ ] **Assertions on the outcome.** You verify the value, the state or the downloaded file, not just that "something appeared". When there is a number, you calculate it separately.
- [ ] **What is not automated, and why.** You wrote down what you decided not to automate (because of cost, fragility, or because a person does it better) and the reason.
- [ ] **Findings reported.** Every difference between a criterion and the app is written up with steps to reproduce it, not hidden with a tweak in the test.
- [ ] **Runs from scratch.** Someone else clones your solution, follows your instructions and gets the same result.

## Share your solution

If you solved one or more stories, share your approach: open an *issue* or a *discussion* in this repository titled "Solution: <module>", with a link to your repository, the framework you used, what you decided not to automate and what you learned. Questions about an ambiguous criterion are also welcome: a well-described ambiguity is a good contribution.
