import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, login, loginToken, makeApp, me, withCookie, COOKIE } from './helpers/app';

const post = (h: Awaited<ReturnType<typeof makeApp>>, url: string) => h.app.inject({ method: 'POST', url });
const cuenta = (h: Awaited<ReturnType<typeof makeApp>>, tabla: string) =>
  (h.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;

describe('S10 sin ENABLE_TEST_ROUTES', () => {
  it('reset y seed → 404 NOT_FOUND y no tocan nada', async () => {
    const h = await makeApp({ enableTestRoutes: false });
    const t = await loginToken(h, 'admin');
    for (const url of ['/__test__/reset', '/__test__/seed']) {
      const res = await post(h, url);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    expect((await me(h, `${COOKIE}=${t}`)).statusCode).toBe(200);
  });
});

describe('S10 con ENABLE_TEST_ROUTES=1', () => {
  it('reset: 204, borra sesiones y deja los datos semilla', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const t = await loginToken(h, 'cajero');
    await h.app.inject({
      method: 'PUT', url: '/api/v1/me/preferences', headers: withCookie(t), payload: { language: 'en', theme: 'dark' },
    });
    const res = await post(h, '/__test__/reset');
    expect(res.statusCode).toBe(204);
    expect((await me(h, `${COOKIE}=${t}`)).statusCode).toBe(401);
    const otra = await login(h, 'cajero@pippos.test', DEMO_PASSWORD);
    expect(otra.statusCode).toBe(200);
    expect(otra.json().preferences).toEqual({ language: 'es', theme: 'light' });
    expect(cuenta(h, 'users')).toBe(3);
    expect(cuenta(h, 'merchants')).toBe(1);
  });

  it('reset sobre una BD vacía la deja sembrada', async () => {
    const h = await makeApp({ enableTestRoutes: true, seed: false });
    expect(cuenta(h, 'users')).toBe(0);
    expect((await post(h, '/__test__/reset')).statusCode).toBe(204);
    expect(cuenta(h, 'users')).toBe(3);
  });

  it('seed siembra una BD vacía y es idempotente', async () => {
    const h = await makeApp({ enableTestRoutes: true, seed: false });
    expect((await login(h, 'admin@pippos.test')).statusCode).toBe(401);
    expect((await post(h, '/__test__/seed')).statusCode).toBe(204);
    expect((await post(h, '/__test__/seed')).statusCode).toBe(204);
    expect(cuenta(h, 'users')).toBe(3);
    expect(cuenta(h, 'merchants')).toBe(1);
    expect((await login(h, 'admin@pippos.test')).statusCode).toBe(200);
  });

  it('seed no pisa lo que ya cambió ni cierra sesiones', async () => {
    const h = await makeApp({ enableTestRoutes: true });
    const t = await loginToken(h, 'cajero');
    await h.app.inject({
      method: 'PUT', url: '/api/v1/me/preferences', headers: withCookie(t), payload: { language: 'en', theme: 'dark' },
    });
    expect((await post(h, '/__test__/seed')).statusCode).toBe(204);
    const res = await me(h, `${COOKIE}=${t}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().preferences).toEqual({ language: 'en', theme: 'dark' });
  });
});
