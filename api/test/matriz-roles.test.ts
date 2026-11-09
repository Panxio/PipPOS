import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN_OK, bearer, crearLlave, loginToken, makeApp, withCookie, type Harness } from './helpers/app';

// S1-S4: matriz rol × endpoint. La tabla es el oráculo (S11, U1, C1, R1, R5, B4); la lista de rutas sale de la app real.
type Quien = 'publica' | 'todos' | 'admin,supervisor' | 'admin' | 'llave';
type Rol = 'anonimo' | 'cajero' | 'supervisor' | 'admin';
const ROLES: Rol[] = ['anonimo', 'cajero', 'supervisor', 'admin'];

const TABLA: Array<[string, string, Quien]> = [
  ['GET', '/health', 'publica'],
  ['POST', '/api/v1/auth/login', 'publica'],
  ['POST', '/api/v1/auth/logout', 'publica'],
  ['POST', '/api/v1/invitations/accept', 'publica'],
  ['GET', '/api/v1/me', 'todos'],
  ['PUT', '/api/v1/me/preferences', 'todos'],
  ['POST', '/api/v1/me/password', 'todos'],
  ['GET', '/api/v1/terminals', 'todos'],
  ['GET', '/api/v1/terminals/:id', 'todos'],
  ['POST', '/api/v1/terminals', 'admin'],
  ['POST', '/api/v1/terminals/import', 'admin'],
  ['PATCH', '/api/v1/terminals/:id', 'admin'],
  ['POST', '/api/v1/transactions', 'todos'],
  ['GET', '/api/v1/transactions', 'todos'],
  ['GET', '/api/v1/transactions/:id', 'todos'],
  ['GET', '/api/v1/transactions/:id/receipt', 'todos'],
  ['POST', '/api/v1/transactions/:id/refund', 'admin,supervisor'],
  ['POST', '/api/v1/transactions/:id/void', 'admin,supervisor'],
  ['GET', '/api/v1/reports/summary', 'admin,supervisor'],
  ['GET', '/api/v1/reports/sales', 'admin,supervisor'],
  ['GET', '/api/v1/reports/sales.csv', 'admin,supervisor'],
  ['GET', '/api/v1/alerts', 'admin,supervisor'],
  ['POST', '/api/v1/alerts/read-all', 'admin,supervisor'],
  ['POST', '/api/v1/alerts/:id/read', 'admin,supervisor'],
  ['GET', '/api/v1/alert-settings', 'admin,supervisor'],
  ['PUT', '/api/v1/alert-settings', 'admin'],
  ['GET', '/api/v1/audit', 'admin'],
  ['GET', '/api/v1/audit.csv', 'admin'],
  ['GET', '/api/v1/branches', 'admin,supervisor'],
  ['POST', '/api/v1/branches', 'admin'],
  ['POST', '/api/v1/branches/:id/tills', 'admin'],
  ['GET', '/api/v1/users', 'admin'],
  ['POST', '/api/v1/users', 'admin'],
  ['PATCH', '/api/v1/users/:id', 'admin'],
  ['POST', '/api/v1/users/:id/invitation', 'admin'],
  ['GET', '/api/v1/mailbox', 'admin'],
  ['GET', '/api/v1/api-keys', 'admin'],
  ['POST', '/api/v1/api-keys', 'admin'],
  ['POST', '/api/v1/api-keys/:id/revoke', 'admin'],
  ['POST', '/api/v1/api-keys/:id/rotate', 'admin'],
  ['GET', '/public/v1/openapi.json', 'publica'],
  ['GET', '/public/v1/terminals', 'llave'],
  ['GET', '/public/v1/terminals/:id', 'llave'],
  ['GET', '/public/v1/transactions', 'llave'],
  ['POST', '/public/v1/transactions', 'llave'],
  ['GET', '/public/v1/transactions/:id', 'llave'],
  ['GET', '/public/v1/reports/summary', 'llave'],
  ['GET', '/public/v1/reports/sales', 'llave'],
];

// Lee el árbol de `printRoutes` y lo vuelve a (método, ruta completa), sin HEAD.
function rutasDe(app: FastifyInstance): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const pila: string[] = [];
  for (const linea of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const m = /^((?:│   |    )*)(?:├── |└── )(.+?) \(([A-Z, ]+)\)$/.exec(linea);
    if (m === null) continue;
    const prof = (m[1] ?? '').length / 4;
    pila[prof] = m[2] ?? '';
    pila.length = prof + 1;
    for (const metodo of (m[3] ?? '').split(', ')) if (metodo !== 'HEAD') out.push([metodo, pila.join('')]);
  }
  return out;
}

let h: Harness;
let llave: Record<string, string>;

// Sesión nueva por petición: algunas filas (logout, cambio de clave) cierran o invalidan la sesión que usan.
async function sesionDe(rol: Rol): Promise<Record<string, string>> {
  return rol === 'anonimo' ? {} : withCookie(await loginToken(h, rol));
}

beforeAll(async () => {
  h = await makeApp({ enableTestRoutes: false, loginRateMax: 100_000, publicRateMax: 100_000 });
  llave = bearer((await crearLlave(h, await sesionDe('admin'), 'write')).key);
});

const url = (plantilla: string): string => plantilla.replace(':id', 'no-existe');

function permitido(quien: Quien, rol: Rol): boolean {
  if (quien === 'publica') return true;
  if (quien === 'llave') return false; // con cookie de sesión, nunca
  if (rol === 'anonimo') return false;
  if (quien === 'todos') return true;
  if (quien === 'admin,supervisor') return rol !== 'cajero';
  return rol === 'admin';
}

describe('S1 la tabla y la app dicen lo mismo', () => {
  it('toda ruta registrada tiene fila y toda fila tiene ruta', () => {
    const reales = rutasDe(h.app).map(([m, p]) => `${m} ${p}`).sort();
    const tabla = TABLA.map(([m, p]) => `${m} ${p}`).sort();
    expect(reales.length).toBeGreaterThanOrEqual(45);
    expect(reales).toEqual(tabla);
  });
});

describe('S2 matriz rol × endpoint', () => {
  for (const [metodo, ruta, quien] of TABLA) {
    for (const rol of ROLES) {
      const esperado = permitido(quien, rol);
      it(`${metodo} ${ruta} · ${rol} · ${quien === 'llave' ? 'sin llave' : esperado ? 'permitido' : 'denegado'}`, async () => {
        const r = await h.app.inject({
          method: metodo as 'GET', url: url(ruta), headers: { origin: ORIGIN_OK, ...(await sesionDe(rol)) },
          payload: metodo === 'GET' ? undefined : {},
        });
        expect(r.statusCode, r.body).toBeLessThan(500);
        if (esperado) {
          expect([401, 403], `${metodo} ${ruta} como ${rol}: ${r.body}`).not.toContain(r.statusCode);
        } else {
          expect(r.statusCode, r.body).toBe(rol === 'anonimo' || quien === 'llave' ? 401 : 403);
        }
      });
    }
  }
});

describe('S3 API pública con llave', () => {
  for (const [metodo, ruta, quien] of TABLA.filter((f) => f[2] === 'llave')) {
    it(`${metodo} ${ruta} · con llave de escritura`, async () => {
      const r = await h.app.inject({ method: metodo as 'GET', url: url(ruta), headers: { origin: ORIGIN_OK, ...llave }, payload: metodo === 'GET' ? undefined : {} });
      expect(quien).toBe('llave');
      expect([401, 403], r.body).not.toContain(r.statusCode);
      expect(r.statusCode, r.body).toBeLessThan(500);
    });
  }
});

describe('S4 rutas de prueba apagadas', () => {
  for (const ruta of ['reset', 'seed', 'transactions', 'terminals/x', 'clock']) {
    it(`/__test__/${ruta} no existe`, async () => {
      const r = await h.app.inject({ method: 'POST', url: `/__test__/${ruta}`, headers: { origin: ORIGIN_OK }, payload: {} });
      expect(r.statusCode).toBe(404);
    });
  }
});
