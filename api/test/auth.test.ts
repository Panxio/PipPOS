import { beforeEach, describe, expect, it } from 'vitest';
import {
  COOKIE, DEMO_PASSWORD, type Harness, login, loginToken, makeApp, me, sinCorrelacion, tokenOf, withCookie,
} from './helpers/app';

const SECCIONES = {
  admin: ['inicio', 'terminales', 'usuarios', 'transacciones', 'reportes', 'alertas', 'liquidaciones'],
  supervisor: ['inicio', 'terminales', 'transacciones', 'reportes', 'alertas'],
  cajero: ['inicio', 'transacciones'],
} as const;
const OCHO_HORAS = 8 * 60 * 60 * 1000;

let h: Harness;
beforeEach(async () => { h = await makeApp(); });

describe('S2 login válido por rol', () => {
  for (const role of ['admin', 'supervisor', 'cajero'] as const) {
    it(`${role}: 200 con rol, secciones, comercio y sin hash`, async () => {
      const res = await login(h, `${role}@pippos.test`);
      expect(res.statusCode).toBe(200);
      const u = res.json();
      expect(u.role).toBe(role);
      expect(u.email).toBe(`${role}@pippos.test`);
      expect(u.sections).toEqual(SECCIONES[role]);
      expect(u.merchantName).toBe('Boliche La Noche');
      expect(u.preferences).toEqual({ language: 'es', theme: 'light' });
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'merchantName', 'name', 'preferences', 'role', 'sections']);
      expect(res.body).not.toMatch(/passwordHash|password_hash/i);
      expect(res.body).not.toContain(`h:${DEMO_PASSWORD}`);
    });
  }

  it('la cookie es HttpOnly; SameSite=Strict; Path=/ y sin Secure', async () => {
    const res = await login(h, 'admin@pippos.test');
    const raw = [res.headers['set-cookie']].flat().join(';');
    expect(raw).toContain(`${COOKIE}=`);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/(;|$)/);
    expect(raw).not.toMatch(/Secure/i);
  });

  it('dos logins del mismo usuario dan tokens distintos y ambos valen', async () => {
    const a = await loginToken(h, 'admin');
    const b = await loginToken(h, 'admin');
    expect(a).not.toBe(b);
    expect((await me(h, `${COOKIE}=${a}`)).statusCode).toBe(200);
    expect((await me(h, `${COOKIE}=${b}`)).statusCode).toBe(200);
  });
});

describe('S3 credenciales malas', () => {
  it('contraseña mala y usuario inexistente: 401 y cuerpo idéntico salvo correlationId', async () => {
    const mala = await login(h, 'admin@pippos.test', 'otra-clave');
    const noExiste = await login(h, 'nadie@pippos.test', DEMO_PASSWORD);
    expect(mala.statusCode).toBe(401);
    expect(noExiste.statusCode).toBe(401);
    expect(mala.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(sinCorrelacion(mala)).toEqual(sinCorrelacion(noExiste));
    expect(mala.headers['set-cookie']).toBeUndefined();
    expect(Object.keys(mala.json().error).sort()).toEqual(['code', 'correlationId']);
  });

  it('con usuario inexistente igual se ejecuta la verificación (mismo costo)', async () => {
    const antes = h.hasher.verifyCalls;
    await login(h, 'nadie@pippos.test', 'x');
    expect(h.hasher.verifyCalls).toBe(antes + 1);
  });
});

describe('S4 normalización y cuerpo estricto (Review Focus 1, 2, 5)', () => {
  it('"  ADMIN@Pippos.test " entra igual que el normalizado', async () => {
    const res = await login(h, '  ADMIN@Pippos.test ');
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('admin@pippos.test');
  });

  it('un campo extra (role) → 400 y no se hereda', async () => {
    const res = await login(h, 'cajero@pippos.test', DEMO_PASSWORD, { role: 'admin' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  const malos: [string, unknown][] = [
    ['email que no es string', { email: 5, password: 'x' }],
    ['password que no es string', { email: 'admin@pippos.test', password: 5 }],
    ['email sin formato', { email: 'no-es-email', password: 'x' }],
    ['password vacía', { email: 'admin@pippos.test', password: '' }],
    ['falta password', { email: 'admin@pippos.test' }],
    ['password de 257', { email: 'admin@pippos.test', password: 'a'.repeat(257) }],
    ['arreglo en vez de objeto', []],
  ];
  for (const [nombre, payload] of malos) {
    it(`${nombre} → 400 VALIDATION_ERROR sin consultar la contraseña`, async () => {
      const antes = h.hasher.verifyCalls;
      const res = await h.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: payload as object });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(h.hasher.verifyCalls).toBe(antes);
    });
  }

  it('contraseña de 256 sí llega a verificarse (borde)', async () => {
    const res = await login(h, 'admin@pippos.test', 'a'.repeat(256));
    expect(res.statusCode).toBe(401);
  });

  it('contraseña de ~1 MB → 400 sin ejecutar el hasher', async () => {
    const antes = h.hasher.verifyCalls;
    const res = await login(h, 'admin@pippos.test', 'a'.repeat(1_000_000));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(h.hasher.verifyCalls).toBe(antes);
  });

  it('cuerpo sobre el límite de Fastify (2 MB) → 413 VALIDATION_ERROR, no 500', async () => {
    const res = await login(h, 'admin@pippos.test', 'a'.repeat(2_000_000));
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('JSON mal formado y cuerpo vacío → 400 VALIDATION_ERROR, no 500', async () => {
    const roto = await h.app.inject({
      method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload: '{"email":',
    });
    expect(roto.statusCode).toBe(400);
    expect(roto.json().error.code).toBe('VALIDATION_ERROR');
    const vacio = await h.app.inject({ method: 'POST', url: '/api/v1/auth/login' });
    expect(vacio.statusCode).toBe(400);
    expect(vacio.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('S6 /me y sesión (Review Focus 3)', () => {
  it('con sesión válida devuelve el SessionUser', async () => {
    const t = await loginToken(h, 'supervisor');
    const res = await me(h, `${COOKIE}=${t}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('supervisor');
    expect(res.json().sections).toEqual(SECCIONES.supervisor);
  });

  const basura: [string, string | undefined][] = [
    ['sin cabecera cookie', undefined],
    ['otra cookie', 'otra=cosa'],
    ['cookie vacía', `${COOKIE}=`],
    ['percent-encoding roto', `${COOKIE}=%E0%A4%A`],
    ['bytes nulos', `${COOKIE}=%00%00`],
    ['inyección SQL', `${COOKIE}=${encodeURIComponent("' OR '1'='1' --")}`],
    ['5000 caracteres', `${COOKIE}=${'a'.repeat(5000)}`],
    ['token inexistente', `${COOKIE}=tok-999`],
  ];
  for (const [nombre, cookie] of basura) {
    it(`${nombre} → 401 UNAUTHENTICATED (nunca 500)`, async () => {
      const res = await me(h, cookie);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    });
  }

  it('cookie manipulada (un carácter cambiado) → 401', async () => {
    const t = await loginToken(h, 'admin');
    const manipulada = t.slice(0, -1) + (t.endsWith('x') ? 'y' : 'x');
    expect((await me(h, `${COOKIE}=${manipulada}`)).statusCode).toBe(401);
  });

  it('vence a las 8 h exactas con el reloj inyectado', async () => {
    const t = await loginToken(h, 'cajero');
    h.clock.t += OCHO_HORAS - 1;
    expect((await me(h, `${COOKIE}=${t}`)).statusCode).toBe(200);
    h.clock.t += 1;
    const res = await me(h, `${COOKIE}=${t}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('el 401 trae correlationId no vacío y distinto por petición', async () => {
    const a = (await me(h)).json().error.correlationId;
    const b = (await me(h)).json().error.correlationId;
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('S7 logout (Review Focus 4)', () => {
  it('204, expira la cookie e invalida el token; reutilizarlo → 401', async () => {
    const t = await loginToken(h, 'admin');
    const out = await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: withCookie(t) });
    expect(out.statusCode).toBe(204);
    expect(out.body).toBe('');
    const c = out.cookies.find((x) => x.name === COOKIE);
    expect(c).toBeDefined();
    expect(c?.value === '' || c?.maxAge === 0 || (c?.expires && c.expires.getTime() < Date.now())).toBe(true);
    expect((await me(h, `${COOKIE}=${t}`)).statusCode).toBe(401);
  });

  it('repetido, sin cookie o con basura → 204', async () => {
    const t = await loginToken(h, 'admin');
    const url = '/api/v1/auth/logout';
    expect((await h.app.inject({ method: 'POST', url, headers: withCookie(t) })).statusCode).toBe(204);
    expect((await h.app.inject({ method: 'POST', url, headers: withCookie(t) })).statusCode).toBe(204);
    expect((await h.app.inject({ method: 'POST', url })).statusCode).toBe(204);
    expect((await h.app.inject({ method: 'POST', url, headers: { cookie: `${COOKIE}=%E0%A4%A` } })).statusCode).toBe(204);
  });

  it('cerrar la sesión de uno no cierra la de otro', async () => {
    const admin = await loginToken(h, 'admin');
    const cajero = await loginToken(h, 'cajero');
    await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: withCookie(admin) });
    expect((await me(h, `${COOKIE}=${cajero}`)).statusCode).toBe(200);
  });
});

describe('S12 preferencias (B2)', () => {
  const put = (token: string | undefined, payload: unknown) =>
    h.app.inject({ method: 'PUT', url: '/api/v1/me/preferences', headers: token ? withCookie(token) : {}, payload: payload as object });

  it('guarda idioma y tema, los devuelve y persisten al volver a entrar', async () => {
    const t = await loginToken(h, 'cajero');
    const res = await put(t, { language: 'en', theme: 'dark' });
    expect(res.statusCode).toBe(200);
    expect(res.json().preferences).toEqual({ language: 'en', theme: 'dark' });
    expect((await me(h, `${COOKIE}=${t}`)).json().preferences).toEqual({ language: 'en', theme: 'dark' });
    const otra = await login(h, 'cajero@pippos.test');
    expect(otra.json().preferences).toEqual({ language: 'en', theme: 'dark' });
    expect(tokenOf(otra)).not.toBe(t);
  });

  it('no toca las preferencias de otro usuario', async () => {
    const t = await loginToken(h, 'cajero');
    await put(t, { language: 'en', theme: 'dark' });
    const admin = await login(h, 'admin@pippos.test');
    expect(admin.json().preferences).toEqual({ language: 'es', theme: 'light' });
  });

  const invalidos: [string, unknown][] = [
    ['idioma fr', { language: 'fr', theme: 'light' }],
    ['tema blue', { language: 'es', theme: 'blue' }],
    ['falta tema', { language: 'es' }],
    ['campo extra role', { language: 'es', theme: 'light', role: 'admin' }],
    ['tipos malos', { language: 1, theme: true }],
  ];
  for (const [nombre, payload] of invalidos) {
    it(`${nombre} → 400 y no cambia nada`, async () => {
      const t = await loginToken(h, 'cajero');
      const res = await put(t, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect((await me(h, `${COOKIE}=${t}`)).json().preferences).toEqual({ language: 'es', theme: 'light' });
    });
  }

  it('sin sesión → 401 y no escribe', async () => {
    const res = await put(undefined, { language: 'en', theme: 'dark' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
    expect((await login(h, 'cajero@pippos.test')).json().preferences).toEqual({ language: 'es', theme: 'light' });
  });
});

describe('errores no previstos', () => {
  it('un fallo interno → 500 INTERNAL_ERROR sin traza ni mensaje', async () => {
    const roto = await makeApp({
      hasher: {
        hash: async () => 'x',
        verify: async () => { throw new Error('secreto-interno /ruta/interna/node_modules'); },
      },
      seed: false,
    });
    const res = await login(roto, 'admin@pippos.test');
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
    expect(Object.keys(res.json().error).sort()).toEqual(['code', 'correlationId']);
    expect(res.body).not.toMatch(/secreto-interno|node_modules|stack|at /);
  });

  it('ruta desconocida → 404 NOT_FOUND con ErrorBody', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/api/v1/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(typeof res.json().error.correlationId).toBe('string');
  });
});
