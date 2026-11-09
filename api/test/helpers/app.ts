import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/adapters/http/app';
import { openDb } from '../../src/adapters/persistence/sqlite';
import type { PasswordHasher } from '../../src/application/ports';
import { DEMO_PASSWORD, seedDemo } from '../../src/seed/demo';
import { FakeClock, FakeHasher, FakeIds } from './fakes';

export const ORIGIN_OK = 'http://127.0.0.1:5173';
export const ORIGIN_AJENO = 'http://evil.test';
export const COOKIE = 'pippos_session';
export { DEMO_PASSWORD };

export interface Harness {
  app: FastifyInstance;
  db: DatabaseSync;
  clock: FakeClock;
  hasher: FakeHasher;
  ids: FakeIds;
}

export interface HarnessOpts {
  enableTestRoutes?: boolean;
  seed?: boolean;
  hasher?: PasswordHasher;
  loginRateMax?: number;
  publicRateMax?: number;
}

// App real con SQLite :memory:, reloj/ids/hasher falsos (el scrypt real se prueba aparte).
export async function makeApp(opts: HarnessOpts = {}): Promise<Harness> {
  const db = openDb(':memory:');
  const clock = new FakeClock(1_700_000_000_000);
  const ids = new FakeIds();
  const hasher = new FakeHasher();
  const active: PasswordHasher = opts.hasher ?? hasher;
  if (opts.seed !== false) await seedDemo(db, active);
  const app = buildApp({
    db, clock, ids, hasher: active, testClock: clock,
    config: { allowedOrigins: [ORIGIN_OK], enableTestRoutes: opts.enableTestRoutes ?? false, loginRateMax: opts.loginRateMax, publicRateMax: opts.publicRateMax },
  });
  await app.ready();
  return { app, db, clock, hasher, ids };
}

export function login(h: Harness, email: string, password: string = DEMO_PASSWORD, extra: Record<string, unknown> = {}) {
  return h.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password, ...extra } });
}

export function tokenOf(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === COOKIE);
  if (!c) throw new Error('la respuesta no trae la cookie de sesión');
  return c.value;
}

export async function loginToken(h: Harness, role: 'admin' | 'supervisor' | 'cajero'): Promise<string> {
  const res = await login(h, `${role}@pippos.test`);
  if (res.statusCode !== 200) throw new Error(`login de ${role} dio ${res.statusCode}`);
  return tokenOf(res);
}

export const withCookie = (token: string) => ({ cookie: `${COOKIE}=${token}` });

export function me(h: Harness, cookieHeader?: string) {
  return h.app.inject({ method: 'GET', url: '/api/v1/me', headers: cookieHeader === undefined ? {} : { cookie: cookieHeader } });
}

// Cuerpo de error sin el correlationId (varía por petición).
export function sinCorrelacion(res: LightMyRequestResponse): unknown {
  const b = res.json() as { error: { code: string; correlationId?: string } };
  return { error: { ...b.error, correlationId: undefined } };
}

// ---- B4: API pública ----
export const IDEM = () => crypto.randomUUID();
export const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

export async function crearLlave(
  h: Harness, cookie: Record<string, string>, scope: 'read' | 'write' = 'read', name = 'llave de prueba',
): Promise<{ id: string; key: string; prefix: string; createdAt: number }> {
  const r = await h.app.inject({ method: 'POST', url: '/api/v1/api-keys', headers: cookie, payload: { name, scope } });
  if (r.statusCode !== 201) throw new Error(`crear llave dio ${r.statusCode}: ${r.body}`);
  return r.json();
}

// Segundo comercio con un admin que puede iniciar sesión (FakeHasher: `h:<clave>`), un terminal y una transacción.
export async function comercioAjeno(h: Harness): Promise<Record<string, string>> {
  h.db.prepare("INSERT INTO merchants (id, name) VALUES ('m-ajeno', 'Otro comercio')").run();
  h.db.prepare(
    `INSERT INTO users (id, merchant_id, name, email, role, password_hash, language, theme)
     VALUES ('u-ajeno', 'm-ajeno', 'Ajeno', 'ajeno@otro.test', 'admin', ?, 'es', 'light')`,
  ).run(`h:${DEMO_PASSWORD}`);
  h.db.prepare(
    `INSERT INTO terminals (id, merchant_id, serial, alias, model, branch, till, status, firmware, battery_pct, connection, created_at_ms)
     VALUES ('t-ajeno','m-ajeno','AJENO-0001','x','x','x','x','active','1.4.2',50,'online',1)`,
  ).run();
  h.db.prepare(
    `INSERT INTO transactions (id, merchant_id, folio, request_id, terminal_id, cashier_id, amount, refunded, method, brand, last4, status, created_at_ms)
     VALUES ('tx-ajena','m-ajeno',1,NULL,'t-ajeno','u-ajeno',777,0,'card','visa','4242','approved',1700000000000)`,
  ).run();
  return withCookie(tokenOf(await login(h, 'ajeno@otro.test')));
}
