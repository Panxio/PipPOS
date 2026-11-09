# Security policy · Política de seguridad

PipPOS is a **demo and practice target**: fictitious money, no real data, and it is meant to run only on `127.0.0.1`. It is not a production service, so there is no supported-versions table. The product has no planted vulnerabilities; the security work in this repository is *testing* it (see [`docs/auditorias`](docs/auditorias/README.md)).

## Reporting a vulnerability

If you find a real flaw in the code (for example an authentication or authorization bypass, or data exposed across merchants), please report it **privately** through GitHub: *Security* tab → *Report a vulnerability*. Please do not open a public issue for it.

Include what you did, what you expected, what happened and the commit you tested. Only test against your own local copy; never against anyone else's machine. This is a hobby project: I will answer as soon as I can, with no guaranteed response time.

Things that are **not** vulnerabilities here: the demo accounts and their shared password (documented in the README), the `/__test__/*` routes (they exist only when `ENABLE_TEST_ROUTES=1`, which must never be set outside your machine), and the absence of HTTPS on `127.0.0.1`.

*Si encuentras un fallo real, repórtalo en privado desde la pestaña Security → Report a vulnerability; no abras un issue público. Las cuentas demo, las rutas `/__test__/*` y la falta de HTTPS en `127.0.0.1` no cuentan como vulnerabilidades.*
