import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Harness, bearer, comercioAjeno, crearLlave, loginToken, makeApp, sinCorrelacion, withCookie,
} from './helpers/app';

const BASE = '/api/v1/api-keys';
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

let h: Harness;
let admin: Record<string, string>;
let supervisor: Record<string, string>;
let cajero: Record<string, string>;

beforeEach(async () => {
  h = await makeApp({ enableTestRoutes: true });
  admin = withCookie(await loginToken(h, 'admin'));
  supervisor = withCookie(await loginToken(h, 'supervisor'));
  cajero = withCookie(await loginToken(h, 'cajero'));
});

const post = (url: string, headers: Record<string, string>, payload?: unknown) =>
  h.app.inject({ method: 'POST', url, headers, payload: payload as object });
const lista = async (headers = admin) => {
  const r = await h.app.inject({ method: 'GET', url: BASE, headers });
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { items: Array<Record<string, unknown>> }).items;
};
const usar = (key: string) => h.app.inject({ method: 'GET', url: '/public/v1/terminals', headers: bearer(key) });
const filasDeLlaves = () => h.db.prepare('SELECT * FROM api_keys').all() as Array<Record<string, unknown>>;

describe('K1 · crear llave', () => {
  it('201 con la forma exacta y la llave «pip_…» solo en esta respuesta', async () => {
    const r = await post(BASE, admin, { name: 'Postman', scope: 'write' });
    expect(r.statusCode, r.body).toBe(201);
    const k = r.json() as Record<string, unknown>;
    expect(Object.keys(k).sort()).toEqual(['createdAt', 'id', 'key', 'name', 'prefix', 'scope']);
    expect(k).toMatchObject({ name: 'Postman', scope: 'write', createdAt: 1_700_000_000_000 });
    expect(k.key).toMatch(/^pip_.{4,}/);
    expect(k.prefix).toBe((k.key as string).slice(0, 8));
    expect(typeof k.id).toBe('string');
  });
  it('en la BD solo queda el sha256 de la llave: ninguna columna la trae en claro', async () => {
    const { key, id } = await crearLlave(h, admin, 'read');
    const filas = filasDeLlaves();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ id, key_hash: sha256(key), merchant_id: 'merchant-boliche-la-noche', user_id: 'user-admin', scope: 'read' });
    expect(JSON.stringify(filas)).not.toContain(key);
  });
  it('cada llave es distinta', async () => {
    const a = await crearLlave(h, admin);
    const b = await crearLlave(h, admin);
    expect(a.key).not.toBe(b.key);
    expect(a.id).not.toBe(b.id);
  });
  it('solo el admin: supervisor y cajero 403, sin sesión 401, y no se crea nada', async () => {
    for (const headers of [supervisor, cajero]) expect((await post(BASE, headers, { name: 'k', scope: 'read' })).statusCode).toBe(403);
    expect((await post(BASE, {}, { name: 'k', scope: 'read' })).statusCode).toBe(401);
    expect(filasDeLlaves()).toHaveLength(0);
  });
  it('cuerpo inválido → 400 y no se crea nada', async () => {
    for (const cuerpo of [{}, { name: '', scope: 'read' }, { name: 'x'.repeat(61), scope: 'read' }, { name: 'k', scope: 'admin' }, { name: 'k', scope: 'read', userId: 'u' }, { name: 5, scope: 'read' }]) {
      const r = await post(BASE, admin, cuerpo);
      expect(r.statusCode, JSON.stringify(cuerpo)).toBe(400);
      expect(r.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
    expect(filasDeLlaves()).toHaveLength(0);
  });
});

describe('K1 · listar', () => {
  it('lista las del comercio sin la llave ni el hash, con revokedAt y lastUsedAt nulos', async () => {
    const { key, id } = await crearLlave(h, admin, 'write', 'Karate');
    const items = await lista();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ id, name: 'Karate', scope: 'write', prefix: key.slice(0, 8), createdAt: 1_700_000_000_000, revokedAt: null, lastUsedAt: null });
    const cuerpo = (await h.app.inject({ method: 'GET', url: BASE, headers: admin })).body;
    expect(cuerpo).not.toContain(key);
    expect(cuerpo).not.toContain(sha256(key));
  });
  it('solo admin: supervisor y cajero 403, sin sesión 401', async () => {
    for (const headers of [supervisor, cajero]) expect((await h.app.inject({ method: 'GET', url: BASE, headers })).statusCode).toBe(403);
    expect((await h.app.inject({ method: 'GET', url: BASE })).statusCode).toBe(401);
  });
  it('no mezcla comercios', async () => {
    await crearLlave(h, admin);
    const ajeno = await comercioAjeno(h);
    expect(await lista(ajeno)).toHaveLength(0);
    await crearLlave(h, ajeno, 'read', 'del otro');
    expect(await lista()).toHaveLength(1);
    expect(await lista(ajeno)).toHaveLength(1);
  });
  it('lastUsedAt se actualiza al usar la llave', async () => {
    const { key } = await crearLlave(h, admin);
    h.clock.advance(5_000);
    expect((await usar(key)).statusCode).toBe(200);
    expect((await lista())[0]!.lastUsedAt).toBe(1_700_000_005_000);
  });
});

describe('K1 · revocar', () => {
  it('200 y la llave deja de valer al tiro; la lista muestra revokedAt', async () => {
    const { key, id } = await crearLlave(h, admin);
    expect((await usar(key)).statusCode).toBe(200);
    h.clock.advance(1_000);
    expect((await post(`${BASE}/${id}/revoke`, admin)).statusCode).toBe(200);
    expect((await usar(key)).statusCode).toBe(401);
    expect((await lista())[0]!.revokedAt).toBe(1_700_000_001_000);
  });
  it('es idempotente: revocar otra vez da 200 y conserva la primera fecha', async () => {
    const { id } = await crearLlave(h, admin);
    h.clock.advance(1_000);
    await post(`${BASE}/${id}/revoke`, admin);
    h.clock.advance(9_000);
    expect((await post(`${BASE}/${id}/revoke`, admin)).statusCode).toBe(200);
    expect((await lista())[0]!.revokedAt).toBe(1_700_000_001_000);
  });
  it('id desconocido o de otro comercio → 404 (y la otra llave sigue viva); solo admin', async () => {
    const ajeno = await comercioAjeno(h);
    const suya = await crearLlave(h, ajeno, 'read', 'del otro');
    expect((await post(`${BASE}/no-existe/revoke`, admin)).statusCode).toBe(404);
    expect((await post(`${BASE}/${suya.id}/revoke`, admin)).statusCode).toBe(404);
    expect((await usar(suya.key)).statusCode).toBe(200);
    const mia = await crearLlave(h, admin);
    for (const headers of [supervisor, cajero]) expect((await post(`${BASE}/${mia.id}/revoke`, headers)).statusCode).toBe(403);
    expect((await post(`${BASE}/${mia.id}/revoke`, {})).statusCode).toBe(401);
    expect((await usar(mia.key)).statusCode).toBe(200);
  });
});

describe('K1 · rotar', () => {
  it('201 con llave nueva de igual nombre y alcance; la vieja muere y la nueva vale', async () => {
    const vieja = await crearLlave(h, admin, 'write', 'Karate');
    const r = await post(`${BASE}/${vieja.id}/rotate`, admin);
    expect(r.statusCode, r.body).toBe(201);
    const nueva = r.json() as { id: string; key: string; name: string; scope: string; prefix: string };
    expect(Object.keys(nueva).sort()).toEqual(['createdAt', 'id', 'key', 'name', 'prefix', 'scope']);
    expect(nueva).toMatchObject({ name: 'Karate', scope: 'write' });
    expect(nueva.id).not.toBe(vieja.id);
    expect(nueva.key).not.toBe(vieja.key);
    expect((await usar(vieja.key)).statusCode).toBe(401);
    expect((await usar(nueva.key)).statusCode).toBe(200);
    const items = await lista();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === vieja.id)!.revokedAt).not.toBeNull();
    expect(items.find((i) => i.id === nueva.id)!.revokedAt).toBeNull();
  });
  it('desconocida o de otro comercio → 404 sin tocar nada; solo admin', async () => {
    const ajeno = await comercioAjeno(h);
    const suya = await crearLlave(h, ajeno, 'read', 'del otro');
    expect((await post(`${BASE}/no-existe/rotate`, admin)).statusCode).toBe(404);
    expect((await post(`${BASE}/${suya.id}/rotate`, admin)).statusCode).toBe(404);
    expect((await usar(suya.key)).statusCode).toBe(200);
    expect(await lista(ajeno)).toHaveLength(1);
    const mia = await crearLlave(h, admin);
    for (const headers of [supervisor, cajero]) expect((await post(`${BASE}/${mia.id}/rotate`, headers)).statusCode).toBe(403);
    expect((await post(`${BASE}/${mia.id}/rotate`, {})).statusCode).toBe(401);
    expect(await lista()).toHaveLength(1);
  });
});

describe('K2 · autenticación en /public/v1', () => {
  it('toda credencial mala da el mismo 401 UNAUTHENTICATED', async () => {
    const { key, id } = await crearLlave(h, admin);
    const revocada = await crearLlave(h, admin);
    await post(`${BASE}/${revocada.id}/revoke`, admin);
    const malas: Array<Record<string, string>> = [
      {}, { authorization: 'Bearer' }, { authorization: 'Bearer ' }, { authorization: 'Bearer x' }, { authorization: `Basic ${key}` },
      { authorization: key }, { authorization: `Bearer ${key}x` }, { authorization: `Bearer ${key.slice(0, -1)}` },
      { authorization: `Bearer ${key.toUpperCase()}` }, { authorization: `Bearer ${revocada.key}` },
      { authorization: "Bearer pip_' OR '1'='1" }, { authorization: `Bearer ${'a'.repeat(10_000)}` },
      { cookie: admin.cookie! },
    ];
    const cuerpos = new Set<string>();
    for (const headers of malas) {
      const r = await h.app.inject({ method: 'GET', url: '/public/v1/terminals', headers });
      expect(r.statusCode, JSON.stringify(headers).slice(0, 80)).toBe(401);
      cuerpos.add(JSON.stringify(sinCorrelacion(r)));
    }
    expect([...cuerpos]).toEqual([JSON.stringify({ error: { code: 'UNAUTHENTICATED' } })]);
    expect((await usar(key)).statusCode).toBe(200);
    expect(id).toBeTruthy();
  });
  it('la llave no vale en /api/v1 ni la cookie en /public/v1', async () => {
    const { key } = await crearLlave(h, admin);
    for (const url of ['/api/v1/terminals', '/api/v1/me', '/api/v1/transactions', '/api/v1/api-keys']) {
      expect((await h.app.inject({ method: 'GET', url, headers: bearer(key) })).statusCode, url).toBe(401);
    }
    expect((await h.app.inject({ method: 'GET', url: '/public/v1/terminals', headers: admin })).statusCode).toBe(401);
  });
  it('si el creador se desactiva, la llave muere', async () => {
    const { key } = await crearLlave(h, admin);
    expect((await usar(key)).statusCode).toBe(200);
    h.db.prepare("UPDATE users SET active = 0 WHERE id = 'user-admin'").run();
    expect((await usar(key)).statusCode).toBe(401);
  });
  it('la llave 401 no actualiza lastUsedAt', async () => {
    const { key } = await crearLlave(h, admin);
    h.clock.advance(1_000);
    await h.app.inject({ method: 'GET', url: '/public/v1/terminals', headers: bearer(`${key}x`) });
    expect((await lista())[0]!.lastUsedAt).toBeNull();
  });
});

describe('K10 · costura', () => {
  it('/__test__/reset borra las llaves (y una llave anterior ya no vale)', async () => {
    const { key } = await crearLlave(h, admin);
    expect((await h.app.inject({ method: 'POST', url: '/__test__/reset' })).statusCode).toBe(204);
    expect(filasDeLlaves()).toHaveLength(0);
    expect((await usar(key)).statusCode).toBe(401);
  });
});
