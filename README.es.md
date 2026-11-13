# PipPOS

**Portal backoffice de terminales POS contactless, hecho como sistema bajo prueba (SUT) para practicar automatización de pruebas.** Terminales, usuarios con roles, feed de transacciones en vivo, reportes, alertas, bitácora de auditoría y una API pública pequeña. Todo el dinero es ficticio y todo escucha solo en `127.0.0.1`.

[English](README.md) · Licencia: MIT · Estado: **demo, no apta para producción**

## Qué hace

- **Terminales:** lista con búsqueda, filtros y orden; alta, edición, activar/desactivar e importación CSV.
- **Usuarios y roles:** `admin`, `supervisor` y `cajero`, sucursales, invitaciones tipo correo, bloqueo de cuenta tras fallos de ingreso y cambio de contraseña.
- **Transacciones:** cobro contra un switch de tarjetas simulado, feed en vivo, filtros, anular y devolver, comprobante imprimible.
- **Reportes:** resumen y ventas en un rango de fechas, agrupadas por día, hora, terminal, cajero, método o marca; exportación CSV.
- **Alertas y bitácora:** umbrales, campana de notificaciones y una bitácora que solo admite altas.
- **API pública** (`/public/v1`, OpenAPI en `/public/v1/openapi.json`) con llaves `read`/`write`, cobros idempotentes y límite de tasa.
- Español e inglés, tema claro y oscuro, y una landing pública.
- «Liquidaciones» es una pantalla vacía a propósito.

## Para qué sirve

Es una app realista con algo que automatizar en todas partes: formularios, tablas, roles, feeds asíncronos, un asistente, importación y exportación de archivos. Cada elemento interactivo lleva un `data-testid` estable (ver [`front/src/testids.ts`](front/src/testids.ts)), así que una suite en Playwright, Selenium, Cypress o Karate no depende de textos ni de CSS. Para practicar hay [historias de usuario](docs/historias/README.md) (también [en inglés](docs/historias/en/README.md)) con criterios *dado / cuando / entonces* por módulo. La suite de pruebas de extremo a extremo del autor **no se publica** (sería la clave de respuestas): la tuya la escribes tú, con el framework que prefieras.

## Cómo correrla

Requisito: Node.js 22.13 o superior.

```bash
npm ci
npm run dev -w api      # API en http://127.0.0.1:3100 (SQLite en api/data, datos de demo al primer arranque)
npm run dev -w front    # front en http://127.0.0.1:5173
```

Abre http://127.0.0.1:5173/ingresar. Cuentas de demo (ficticias, las crea la semilla): `admin@pippos.test`, `supervisor@pippos.test` y `cajero@pippos.test`, todas con la contraseña `demo-pippos-2026`.

Variables de entorno de la API: `PORT`, `DB_PATH` (`:memory:` sirve), `ALLOWED_ORIGINS`, `LOGIN_RATE_MAX`, `PUBLIC_RATE_MAX` y `ENABLE_TEST_ROUTES=1`, que añade rutas `/__test__/*` para suites de automatización (todas `POST`, sin sesión). No actives las rutas de prueba fuera de tu máquina.

| Ruta de prueba | Para qué sirve |
|---|---|
| `/__test__/reset` | Borra todo, repone los datos de demo y devuelve el reloj a cero |
| `/__test__/seed` | Repone los datos de demo sin borrar lo demás |
| `/__test__/clock` con `{"advanceMs": n}` | Adelanta n milisegundos el reloj del servidor (para sesión que vence o bloqueo de cuenta) |
| `/__test__/transactions` | Inserta una transacción ya resuelta (estado, monto y fecha a elección), sin pasar por el switch |
| `/__test__/terminals/:id/telemetry` con `{"connection"?, "batteryPct"?}` | Cambia la conexión o la batería de un terminal |

## Pruebas

```bash
npm test                # api, shared y front (Vitest)
npm run typecheck
```

Medido de nuevo el 2026-11-13: API 851, shared 26 y front 255 pruebas unitarias y de integración, todas en verde.

## Pruebas de seguridad

El producto es seguro por diseño (sin vulnerabilidades plantadas ni flags); el trabajo de seguridad consiste en *probarlo*. Una matriz rol × endpoint de 205 pruebas, más auditorías externas gratuitas contra la app local. Números y cómo se midieron: [`docs/auditorias/`](docs/auditorias/README.md).

## Arquitectura

`api/` Fastify 5, `node:sqlite` y Zod, en una arquitectura hexagonal ligera (`domain/` puro, casos de uso y puertos en `application/`, `adapters/` en el borde); `front/` React 19, Vite y Tailwind 4; `shared/` los contratos Zod que usan ambos lados. El dinero son enteros en unidad mínima (`bigint`), una cadena decimal en JSON, nunca un `number`.

## Créditos

Tipografías: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) e [IBM Plex Mono](https://www.ibm.com/plex/), ambas con la licencia SIL Open Font License 1.1, vía `@fontsource`. Publicado bajo la [licencia MIT](LICENSE).
