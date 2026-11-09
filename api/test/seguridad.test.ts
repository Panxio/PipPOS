import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  COOKIE, DEMO_PASSWORD, type Harness, ORIGIN_AJENO, ORIGIN_OK, login, loginToken, makeApp, me, withCookie,
} from './helpers/app';

let h: Harness;
beforeEach(async () => { h = await makeApp({ enableTestRoutes: true }); });

const LOGIN = '/api/v1/auth/login';

describe('S8 Origin en peticiones con efecto', () => {
  const casos: [string, string][] = [
    ['POST', LOGIN], ['POST', '/api/v1/auth/logout'], ['PUT', '/api/v1/me/preferences'],
    ['POST', '/__test__/reset'], ['POST', '/__test__/seed'],
  ];
  for (const [method, url] of casos) {
    for (const origin of [ORIGIN_AJENO, 'null', `${ORIGIN_OK}.evil.test`, 'http://127.0.0.1:5174']) {
      it(`${method} ${url} con Origin ${origin} → 403 ORIGIN_NOT_ALLOWED`, async () => {
        const token = await loginToken(h, 'admin');
        const res = await h.app.inject({
          method: method as 'POST' | 'PUT', url, headers: { origin, ...withCookie(token) },
          payload: { email: 'admin@pippos.test', password: DEMO_PASSWORD, language: 'en', theme: 'dark' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
        expect(Object.keys(res.json().error).sort()).toEqual(['code', 'correlationId']);
      });
    }
  }

  it('un Origin ajeno no logra cerrar la sesión ni cambiar preferencias', async () => {
    const t = await loginToken(h, 'cajero');
    await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: ORIGIN_AJENO, ...withCookie(t) } });
    await h.app.inject({
      method: 'PUT', url: '/api/v1/me/preferences', headers: { origin: ORIGIN_AJENO, ...withCookie(t) },
      payload: { language: 'en', theme: 'dark' },
    });
    const res = await me(h, `${COOKIE}=${t}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().preferences).toEqual({ language: 'es', theme: 'light' });
  });

  it('el Origin permitido pasa, y sin Origin también (Karate, Postman)', async () => {
    const con = await h.app.inject({
      method: 'POST', url: LOGIN, headers: { origin: ORIGIN_OK }, payload: { email: 'admin@pippos.test', password: DEMO_PASSWORD },
    });
    expect(con.statusCode).toBe(200);
    const sin = await login(h, 'admin@pippos.test');
    expect(sin.statusCode).toBe(200);
  });

  it('un GET con Origin ajeno no se rechaza (solo se vigila lo que tiene efecto)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health', headers: { origin: ORIGIN_AJENO } });
    expect(res.statusCode).toBe(200);
  });

  it('no se emiten cabeceras CORS', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health', headers: { origin: ORIGIN_OK } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('S9 cabeceras', () => {
  const rutas = [
    () => h.app.inject({ method: 'GET', url: '/health' }),
    () => me(h),
    () => h.app.inject({ method: 'GET', url: '/ruta-que-no-existe' }),
    () => login(h, 'admin@pippos.test'),
  ];
  for (const [i, pedir] of rutas.entries()) {
    it(`ruta ${i + 1}: CSP, nosniff, Referrer-Policy y sin X-Powered-By`, async () => {
      const res = await pedir();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBeTruthy();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  }
});

describe('S5 límite de intentos de login', () => {
  const mal = (ip = '127.0.0.1', extra: Record<string, string> = {}, email = 'admin@pippos.test') =>
    h.app.inject({
      method: 'POST', url: LOGIN, remoteAddress: ip, headers: extra, payload: { email, password: 'mala' },
    });

  it('el 6.º intento fallido en el minuto → 429 RATE_LIMITED, aunque venga con la clave buena', async () => {
    // U10: la cuenta se bloquea al 3.er fallo, así que el 4.º y el 5.º dan 423; el límite por IP sigue contando todos.
    for (let i = 0; i < 3; i++) expect((await mal()).statusCode).toBe(401);
    for (let i = 0; i < 2; i++) expect((await mal()).statusCode).toBe(423);
    const sexto = await mal();
    expect(sexto.statusCode).toBe(429);
    expect(sexto.json().error.code).toBe('RATE_LIMITED');
    expect(Object.keys(sexto.json().error).sort()).toEqual(['code', 'correlationId']);
    expect((await login(h, 'admin@pippos.test')).statusCode).toBe(429);
  });

  it('otra IP no queda bloqueada', async () => {
    for (let i = 0; i < 6; i++) await mal();
    // otra IP y otra cuenta (la de admin quedó bloqueada por U10): el límite por IP no la alcanza
    expect((await mal('10.9.9.9', {}, 'supervisor@pippos.test')).statusCode).toBe(401);
  });

  it('falsear X-Forwarded-For no evade el límite', async () => {
    for (let i = 0; i < 5; i++) await mal('127.0.0.1', { 'x-forwarded-for': `1.2.3.${i}` });
    expect((await mal('127.0.0.1', { 'x-forwarded-for': '9.9.9.9' })).statusCode).toBe(429);
  });

  it('solo se limita el login: /me, preferencias y logout no', async () => {
    const t = await loginToken(h, 'admin');
    for (let i = 0; i < 12; i++) {
      expect((await me(h, `${COOKIE}=${t}`)).statusCode).toBe(200);
      expect((await h.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
  });
});

describe('sesiones y contraseñas en la base', () => {
  it('la tabla sessions guarda sha256 hex del token, nunca el token', async () => {
    const t = await loginToken(h, 'admin');
    const filas = h.db.prepare('SELECT * FROM sessions').all();
    expect(filas).toHaveLength(1);
    const texto = JSON.stringify(filas);
    expect(texto).not.toContain(t);
    expect(texto).toContain(createHash('sha256').update(t).digest('hex'));
  });

  it('users no guarda la contraseña en claro', async () => {
    const texto = JSON.stringify(h.db.prepare('SELECT * FROM users').all());
    expect(texto).not.toContain(`"${DEMO_PASSWORD}"`);
    expect(texto).toContain('@pippos.test');
  });

  it('tras el logout la fila de la sesión desaparece', async () => {
    const t = await loginToken(h, 'admin');
    await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: withCookie(t) });
    expect(h.db.prepare('SELECT * FROM sessions').all()).toHaveLength(0);
  });
});
