import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, ORIGIN_AJENO, login, loginToken, makeApp, me, withCookie } from './helpers/app';

type H = Awaited<ReturnType<typeof makeApp>>;
const post = (h: H, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  h.app.inject({ method: 'POST', url, headers, payload: payload as object });
const cuenta = (h: H, tabla: string) => (h.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
const HORA = 3_600_000;

describe('U11 POST /__test__/clock', () => {
  it('sin ENABLE_TEST_ROUTES → 404 NOT_FOUND y el reloj no se mueve', async () => {
    const h = await makeApp({ enableTestRoutes: false });
    const antes = h.clock.nowMs();
    const r = await post(h, '/__test__/clock', { advanceMs: 1000 });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
    expect(h.clock.nowMs()).toBe(antes);
  });

  it('204 y adelanta el reloj del servidor, acumulando', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const antes = h.clock.nowMs();
    expect((await post(h, '/__test__/clock', { advanceMs: 1000 })).statusCode).toBe(204);
    expect((await post(h, '/__test__/clock', { advanceMs: 2500 })).statusCode).toBe(204);
    expect(h.clock.nowMs()).toBe(antes + 3500);
  });

  it('bordes: 0 y 2 592 000 000 sí; negativo, decimal, texto, null, mayor al máximo, vacío o con extra → 400', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    expect((await post(h, '/__test__/clock', { advanceMs: 0 })).statusCode).toBe(204);
    expect((await post(h, '/__test__/clock', { advanceMs: 2_592_000_000 })).statusCode).toBe(204);
    const antes = h.clock.nowMs();
    for (const cuerpo of [{ advanceMs: -1 }, { advanceMs: 1.5 }, { advanceMs: '5' }, { advanceMs: null }, { advanceMs: 2_592_000_001 },
      {}, { advanceMs: 5, extra: 1 }]) {
      const r = await post(h, '/__test__/clock', cuerpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(h.clock.nowMs()).toBe(antes);
  });

  it('Origin ajeno → 403 ORIGIN_NOT_ALLOWED y no mueve el reloj', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const antes = h.clock.nowMs();
    const r = await post(h, '/__test__/clock', { advanceMs: 1000 }, { origin: ORIGIN_AJENO });
    expect(r.statusCode).toBe(403);
    expect(h.clock.nowMs()).toBe(antes);
  });

  it('por HTTP la sesión vence a las 8 h exactas', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const t = `pippos_session=${(await login(h, 'admin@pippos.test', DEMO_PASSWORD)).cookies[0].value}`;
    await post(h, '/__test__/clock', { advanceMs: 8 * HORA - 1 });
    expect((await me(h, t)).statusCode).toBe(200);
    await post(h, '/__test__/clock', { advanceMs: 1 });
    expect((await me(h, t)).statusCode).toBe(401);
  });
});

describe('U11 reset y seed con las tablas de R2', () => {
  it('reset: reloj a su origen y solo queda la semilla (2 sucursales, 3 cajas, 3 usuarios, sin invitaciones ni bandeja)', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const admin = withCookie(await loginToken(h, 'admin'));
    const inicio = h.clock.nowMs();
    await h.app.inject({ method: 'POST', url: '/api/v1/branches', headers: admin, payload: { name: 'Sur' } });
    await h.app.inject({ method: 'POST', url: '/api/v1/users', headers: admin, payload: { name: 'Ana', email: 'ana@pippos.test', role: 'admin' } });
    h.db.prepare("INSERT INTO merchants (id, name) VALUES ('m-ajeno', 'Otro')").run();
    await post(h, '/__test__/clock', { advanceMs: HORA });
    expect(cuenta(h, 'invitations')).toBe(1);
    expect(cuenta(h, 'mailbox')).toBe(1);

    expect((await post(h, '/__test__/reset')).statusCode).toBe(204);
    expect(h.clock.nowMs()).toBe(inicio);
    expect([cuenta(h, 'branches'), cuenta(h, 'tills'), cuenta(h, 'users'), cuenta(h, 'invitations'), cuenta(h, 'mailbox'), cuenta(h, 'merchants')])
      .toEqual([2, 3, 3, 0, 0, 1]);
    const otra = await login(h, 'cajero@pippos.test', DEMO_PASSWORD);
    expect(otra.statusCode).toBe(200);
  });

  it('seed es idempotente con sucursales y cajas y no pisa lo creado', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const admin = withCookie(await loginToken(h, 'admin'));
    await h.app.inject({ method: 'POST', url: '/api/v1/branches', headers: admin, payload: { name: 'Sur' } });
    expect((await post(h, '/__test__/seed')).statusCode).toBe(204);
    expect((await post(h, '/__test__/seed')).statusCode).toBe(204);
    expect([cuenta(h, 'branches'), cuenta(h, 'tills'), cuenta(h, 'users')]).toEqual([3, 3, 3]);
  });

  it('seed sobre una BD vacía deja que el cajero quede en la sucursal Centro', async () => {
    const h = await makeApp({ enableTestRoutes: true, seed: false });
    await post(h, '/__test__/seed');
    const fila = h.db.prepare("SELECT b.name AS n FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.email = 'cajero@pippos.test'").get() as { n: string };
    expect(fila.n).toBe('Centro');
  });
});

describe('U11 límite de login configurable', () => {
  it('con loginRateMax 2 el 3.er intento → 429; con 100 pasan 10; sin valor sigue en 5', async () => {
    const dos = await makeApp({ loginRateMax: 2 });
    expect([(await login(dos, 'admin@pippos.test')).statusCode, (await login(dos, 'admin@pippos.test')).statusCode,
      (await login(dos, 'admin@pippos.test')).statusCode]).toEqual([200, 200, 429]);
    const cien = await makeApp({ loginRateMax: 100 });
    for (let i = 0; i < 10; i++) expect((await login(cien, 'admin@pippos.test')).statusCode).toBe(200);
    const defecto = await makeApp();
    for (let i = 0; i < 5; i++) expect((await login(defecto, 'admin@pippos.test')).statusCode).toBe(200);
    expect((await login(defecto, 'admin@pippos.test')).statusCode).toBe(429);
  });
});
