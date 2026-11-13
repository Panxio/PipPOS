# Contributing · Cómo contribuir

PipPOS is a **demo and practice target** for test automation, so its behaviour is a contract: the [user stories](docs/historias/README.md) describe what the app must do, and people write their own tests against it. Small, well-tested fixes are welcome; behaviour changes need a conversation first.

## Ways to help
- **Bugs and ideas:** open an [issue](https://github.com/Panxio/PipPOS/issues) with what you did, what you expected, what happened and the commit you used.
- **Your automation solution:** share it in [Discussions](https://github.com/Panxio/PipPOS/discussions) (see the "Share your solution" section of the stories index).
- **Security flaws:** do **not** open an issue; follow [SECURITY.md](SECURITY.md).

## Sending a change
1. Open an issue first if the change alters behaviour described in the user stories.
2. Fork, branch, and keep the change small and focused.
3. Every behaviour change or fix comes **with a test** that fails without it (unit/integration tests live in `api/test`, `front/test` and `shared/test`).
4. Before the pull request, run from the repository root:
   ```bash
   npm ci
   npm run typecheck
   npm test
   ```
5. No new dependencies unless the issue agreed on them. Business logic stays in `api/src/domain`, with no framework imports.

By contributing you agree that your work is released under the [MIT License](LICENSE).

*Resumen: los errores e ideas van en Issues; tu solución de automatización, en Discussions; los fallos de seguridad, en privado (SECURITY.md). Todo cambio de comportamiento se conversa antes en un issue, y todo cambio o arreglo lleva su test; antes del pull request corre `npm ci`, `npm run typecheck` y `npm test`.*
