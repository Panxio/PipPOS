import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, comercioAjeno, loginToken, makeApp, withCookie } from './helpers/app';

const BASE = '/api/v1/alerts';
const SETTINGS = '/api/v1/alert-settings';
const T1 = 'term-demo-0001';
const T2 = 'term-demo-0002'; // activo, offline, batería 12 %
const T3 = 'term-demo-0003'; // inactivo
const T0 = 1_700_000_000_000;
const CLAVES_ALERTA = ['createdAt', 'id', 'params', 'read', 'resolvedAt', 'type'];

let h: Harness;
let admin: Record<string, string>;
let supervisor: Record<string, string>;
let cajero: Record<string, string>;

beforeEach(async () => {
  h = await makeApp({ enableTestRoutes: true, loginRateMax: 100 });
  admin = withCookie(await loginToken(h, 'admin'));
  supervisor = withCookie(await loginToken(h, 'supervisor'));
  cajero = withCookie(await loginToken(h, 'cajero'));
});

type Alerta = { id: string; type: string; createdAt: number; resolvedAt: number | null; read: boolean; params: Record<string, unknown> };
type Lista = { items: Alerta[]; unreadCount: number };
type Body = Record<string, unknown>;
const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const post = (url: string, headers = admin, payload?: unknown) => h.app.inject({ method: 'POST', url, headers, payload: payload as object | undefined });
const put = (url: string, payload: unknown, headers = admin) => h.app.inject({ method: 'PUT', url, headers, payload: payload as object });
const alertas = async (qs = '', headers = admin): Promise<Lista> => {
  const r = await get(`${BASE}${qs}`, headers);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const telemetria = (id: string, cuerpo: Body) =>
  h.app.inject({ method: 'POST', url: `/__test__/terminals/${id}/telemetry`, payload: cuerpo });
const ajustes = (cuerpo: Body = { batteryBelowPct: 20, voidAtLeastAmount: '100000' }, headers = admin) => put(SETTINGS, cuerpo, headers);
const tipos = (l: Lista) => l.items.map((a) => a.type).sort();
const abiertas = (l: Lista) => l.items.filter((a) => a.resolvedAt === null);
const filasDeAlertas = () => h.db.prepare('SELECT * FROM alerts').all() as Array<Record<string, unknown>>;
const cobrar = async (amount: string, terminalId = T1) => {
  const r = await post('/api/v1/transactions', admin, { requestId: crypto.randomUUID(), terminalId, amount, method: 'card', brand: 'visa', last4: '4242' });
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string; folio: number }).id;
};
const anular = (id: string, headers = admin) => post(`/api/v1/transactions/${id}/void`, headers);
const ordenEsperado = (a: Alerta, b: Alerta) => (b.createdAt - a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

describe('A5 · forma y contenido de la lista (semilla de demo)', () => {
  it('el terminal caído y con poca batería genera dos alertas; el que está sano y el inactivo, ninguna', async () => {
    const l = await alertas();
    expect(tipos(l)).toEqual(['battery_low', 'terminal_offline']);
    expect(l.unreadCount).toBe(2);
    for (const a of l.items) {
      expect(Object.keys(a).sort()).toEqual(CLAVES_ALERTA);
      expect(a).toMatchObject({ createdAt: T0, resolvedAt: null, read: false });
      expect(typeof a.id).toBe('string');
    }
    expect(l.items.find((a) => a.type === 'terminal_offline')!.params).toEqual({ terminalId: T2, alias: 'Terraza' });
    expect(l.items.find((a) => a.type === 'battery_low')!.params).toEqual({ terminalId: T2, alias: 'Terraza', batteryPct: 12 });
  });
  it('el JSON no trae textos ya armados ni campos internos (merchant_id, dedupe)', async () => {
    const r = await get(BASE);
    expect(r.statusCode).toBe(200);
    expect((r.json() as Lista).items).toHaveLength(2);
    const cuerpo = r.body;
    expect(cuerpo).not.toMatch(/merchant|dedupe|offline:|battery:/i);
  });
  it('más reciente primero (createdAt desc, empate por id desc)', async () => {
    h.clock.advance(60_000);
    await telemetria(T1, { batteryPct: 5 });
    await alertas();
    h.clock.advance(60_000);
    await telemetria(T1, { connection: 'offline' });
    const l = await alertas();
    expect(l.items).toHaveLength(4);
    expect(l.items.map((a) => a.id)).toEqual([...l.items].sort(ordenEsperado).map((a) => a.id));
    expect(l.items[0]!.createdAt).toBe(T0 + 120_000);
    expect(l.items[0]!.type).toBe('terminal_offline');
  });
  it('unread=true lista las no leídas y no resueltas; limit recorta pero unreadCount no', async () => {
    const todas = await alertas();
    expect((await post(`${BASE}/${todas.items[0]!.id}/read`)).statusCode).toBe(200);
    const sin = await alertas('?unread=true');
    expect(sin.items.map((a) => a.id)).toEqual([todas.items[1]!.id]);
    expect(sin.unreadCount).toBe(1);
    const uno = await alertas('?limit=1');
    expect(uno.items).toHaveLength(1);
    expect(uno.unreadCount).toBe(1);
  });
  it('parámetros inválidos o desconocidos → 400 VALIDATION_ERROR', async () => {
    for (const qs of ['?limit=0', '?limit=101', '?limit=abc', '?unread=maybe', '?foo=1', '?page=1']) {
      const r = await get(`${BASE}${qs}`);
      expect(r.statusCode, qs).toBe(400);
      expect(r.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });
});

describe('A3/A4 · evaluación de terminales y costura de telemetría', () => {
  it('batería: 19 alerta, 20 no (estricto); el porcentaje viaja en params', async () => {
    await telemetria(T2, { connection: 'online', batteryPct: 20 });
    expect(abiertas(await alertas())).toHaveLength(0);
    await telemetria(T2, { batteryPct: 19 });
    const l = await alertas();
    expect(abiertas(l).map((a) => [a.type, a.params.batteryPct])).toEqual([['battery_low', 19]]);
  });
  it('al volver a conectar y cargar, las alertas se resuelven (quedan listadas con resolvedAt) y el contador baja a 0', async () => {
    await alertas();
    h.clock.advance(1000);
    await telemetria(T2, { connection: 'online', batteryPct: 80 });
    const l = await alertas();
    expect(l.items).toHaveLength(2);
    for (const a of l.items) expect(a.resolvedAt).toBe(T0 + 1000);
    expect(l.unreadCount).toBe(0);
    expect((await alertas('?unread=true')).items).toHaveLength(0);
  });
  it('si la condición vuelve nace una alerta NUEVA y la resuelta se conserva', async () => {
    const primera = (await alertas()).items.find((a) => a.type === 'terminal_offline')!;
    await telemetria(T2, { connection: 'online' });
    await alertas();
    h.clock.advance(5000);
    await telemetria(T2, { connection: 'offline' });
    const l = await alertas();
    const caidas = l.items.filter((a) => a.type === 'terminal_offline');
    expect(caidas).toHaveLength(2);
    expect(caidas.filter((a) => a.resolvedAt === null)).toHaveLength(1);
    expect(caidas.find((a) => a.id === primera.id)!.resolvedAt).not.toBeNull();
    expect(caidas.find((a) => a.resolvedAt === null)!.createdAt).toBe(T0 + 5000);
  });
  it('a lo más una alerta abierta por clave: consultas repetidas y simultáneas no duplican', async () => {
    await telemetria(T1, { connection: 'offline' });
    await Promise.all([alertas(), alertas(), alertas(), alertas('', supervisor), alertas('?limit=5')]);
    await alertas();
    const abiertasT1 = filasDeAlertas().filter((f) => String(f.params_json).includes(T1) && f.resolved_at_ms === null);
    expect(abiertasT1).toHaveLength(1);
    expect(abiertas(await alertas()).filter((a) => a.params.terminalId === T1)).toHaveLength(1);
  });
  it('la base misma impide dos abiertas con la misma clave, pero admite varias resueltas', () => {
    const ins = (id: string, resuelta: number | null) =>
      h.db.prepare(
        `INSERT INTO alerts (id, merchant_id, type, dedupe_key, params_json, created_at_ms, resolved_at_ms)
         VALUES (?, 'merchant-boliche-la-noche', 'terminal_offline', 'offline:xx', '{}', 1, ?)`,
      ).run(id, resuelta);
    ins('a1', null);
    expect(() => ins('a2', null)).toThrow();
    ins('a3', 5);
    ins('a4', 6);
    expect(filasDeAlertas().filter((f) => f.dedupe_key === 'offline:xx')).toHaveLength(3);
  });
  it('desactivar el terminal resuelve sus alertas; un terminal inactivo no genera ninguna', async () => {
    await alertas();
    const r = await h.app.inject({ method: 'PATCH', url: `/api/v1/terminals/${T2}`, headers: admin, payload: { status: 'inactive' } });
    expect(r.statusCode).toBe(200);
    const l = await alertas();
    expect(abiertas(l)).toHaveLength(0);
    expect(l.unreadCount).toBe(0);
    await telemetria(T3, { connection: 'offline', batteryPct: 1 });
    expect(abiertas(await alertas()).filter((a) => a.params.terminalId === T3)).toHaveLength(0);
  });
  it('un terminal recién creado nace offline y alerta (decisión e)', async () => {
    const r = await h.app.inject({
      method: 'POST', url: '/api/v1/terminals', headers: admin,
      payload: { serial: 'TERM-0900', alias: 'Nueva', model: 'PAX A920', branch: 'Centro', till: 'Caja 1' },
    });
    expect(r.statusCode, r.body).toBe(201);
    const id = (r.json() as { id: string }).id;
    const l = await alertas();
    expect(abiertas(l).filter((a) => a.params.terminalId === id).map((a) => a.type)).toEqual(['terminal_offline']);
  });
  it('cambiar el umbral de batería reevalúa: subirlo crea, bajarlo (o igualarlo) resuelve', async () => {
    await telemetria(T2, { connection: 'online', batteryPct: 15 });
    await alertas();
    expect(abiertas(await alertas()).map((a) => a.type)).toEqual(['battery_low']);
    expect((await ajustes({ batteryBelowPct: 15, voidAtLeastAmount: '100000' })).statusCode).toBe(200);
    expect(abiertas(await alertas())).toHaveLength(0);
    expect((await ajustes({ batteryBelowPct: 16, voidAtLeastAmount: '100000' })).statusCode).toBe(200);
    expect(abiertas(await alertas()).map((a) => a.type)).toEqual(['battery_low']);
  });
  it('la costura de telemetría: 404 sin la flag, 404 si no existe, 400 si el cuerpo no vale', async () => {
    const sin = await makeApp({ enableTestRoutes: false });
    expect((await sin.app.inject({ method: 'POST', url: `/__test__/terminals/${T1}/telemetry`, payload: { batteryPct: 5 } })).statusCode).toBe(404);
    expect((await telemetria('no-existe', { batteryPct: 5 })).statusCode).toBe(404);
    for (const malo of [{}, { batteryPct: 101 }, { batteryPct: -1 }, { batteryPct: 'x' }, { batteryPct: 5.5 }, { connection: 'zzz' }, { alias: 'x' }, { batteryPct: 5, extra: 1 }]) {
      expect((await telemetria(T1, malo)).statusCode, JSON.stringify(malo)).toBe(400);
    }
    const ok = await telemetria(T1, { batteryPct: 33 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ id: T1, batteryPct: 33 });
  });
});

describe('A3 · alertas de anulación', () => {
  it('anular 100000 (= umbral) crea la alerta en la misma operación, antes de cualquier consulta', async () => {
    const id = await cobrar('100000');
    expect((await anular(id)).statusCode).toBe(200);
    expect(filasDeAlertas().filter((f) => f.type === 'void_over_threshold')).toHaveLength(1);
    const l = await alertas();
    const a = l.items.find((x) => x.type === 'void_over_threshold')!;
    expect(a.params).toEqual({ transactionId: id, folio: expect.any(Number), amount: '100000' });
    expect(a).toMatchObject({ read: false, resolvedAt: null });
    expect(l.unreadCount).toBe(3);
  });
  it('99999 no alerta; devolver (aunque sea grande) tampoco', async () => {
    expect((await anular(await cobrar('99999'))).statusCode).toBe(200);
    const grande = await cobrar('500000');
    expect((await post(`/api/v1/transactions/${grande}/refund`, admin, { amount: '500000' })).statusCode).toBe(200);
    expect(filasDeAlertas().filter((f) => f.type === 'void_over_threshold')).toHaveLength(0);
  });
  it('un supervisor también puede anular y la alerta nace; el umbral nuevo rige hacia adelante, no hacia atrás', async () => {
    const vieja = await cobrar('6000');
    expect((await anular(vieja)).statusCode).toBe(200);
    expect((await ajustes({ batteryBelowPct: 20, voidAtLeastAmount: '5000' })).statusCode).toBe(200);
    expect((await alertas()).items.filter((a) => a.type === 'void_over_threshold')).toHaveLength(0);
    const nueva = await cobrar('6000');
    expect((await anular(nueva, supervisor)).statusCode).toBe(200);
    const l = await alertas();
    expect(l.items.filter((a) => a.type === 'void_over_threshold').map((a) => a.params.transactionId)).toEqual([nueva]);
  });
  it('las alertas de anulación nunca se resuelven', async () => {
    const id = await cobrar('200000');
    await anular(id);
    h.clock.advance(3_600_000);
    await telemetria(T2, { connection: 'online', batteryPct: 90 });
    const l = await alertas();
    expect(l.items.find((a) => a.type === 'void_over_threshold')!.resolvedAt).toBeNull();
    expect(l.unreadCount).toBe(1);
  });
  it('una anulación rechazada (ya anulada → 409) no duplica la alerta', async () => {
    const id = await cobrar('150000');
    await anular(id);
    expect((await anular(id)).statusCode).toBe(409);
    expect(filasDeAlertas().filter((f) => f.type === 'void_over_threshold')).toHaveLength(1);
  });
});

describe('A6 · marcar leída (por usuario)', () => {
  it('que el admin la lea no la lee el supervisor; es idempotente', async () => {
    const [a, b] = (await alertas()).items;
    expect((await post(`${BASE}/${a!.id}/read`)).statusCode).toBe(200);
    expect((await post(`${BASE}/${a!.id}/read`)).statusCode).toBe(200);
    const yo = await alertas();
    expect(yo.items.find((x) => x.id === a!.id)!.read).toBe(true);
    expect(yo.items.find((x) => x.id === b!.id)!.read).toBe(false);
    expect(yo.unreadCount).toBe(1);
    const otro = await alertas('', supervisor);
    expect(otro.unreadCount).toBe(2);
    expect(otro.items.every((x) => !x.read)).toBe(true);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM alert_reads').get()).toEqual({ n: 1 });
  });
  it('una alerta resuelta también se puede marcar', async () => {
    const [a] = (await alertas()).items;
    await telemetria(T2, { connection: 'online', batteryPct: 90 });
    await alertas();
    expect((await post(`${BASE}/${a!.id}/read`)).statusCode).toBe(200);
    expect((await alertas()).items.find((x) => x.id === a!.id)!.read).toBe(true);
  });
  it('read-all marca solo las abiertas no leídas del usuario y devuelve cuántas', async () => {
    const [a] = (await alertas()).items;
    await post(`${BASE}/${a!.id}/read`);
    const r = await post(`${BASE}/read-all`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ marked: 1 });
    expect((await alertas()).unreadCount).toBe(0);
    expect((await post(`${BASE}/read-all`)).json()).toEqual({ marked: 0 });
    expect((await alertas('', supervisor)).unreadCount).toBe(2);
  });
  it('read-all no cuenta las resueltas', async () => {
    await alertas();
    await telemetria(T2, { connection: 'online', batteryPct: 90 });
    await alertas();
    expect((await post(`${BASE}/read-all`)).json()).toEqual({ marked: 0 });
  });
  it('id inexistente → 404 NOT_FOUND (con la ruta viva: una alerta real da 200)', async () => {
    expect((await post(`${BASE}/${(await alertas()).items[0]!.id}/read`)).statusCode).toBe(200);
    const r = await post(`${BASE}/no-existe/read`);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('A2 · umbrales', () => {
  it('GET sin fila devuelve los valores por defecto; lo leen admin y supervisor', async () => {
    for (const headers of [admin, supervisor]) {
      const r = await get(SETTINGS, headers);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ batteryBelowPct: 20, voidAtLeastAmount: '100000' });
    }
  });
  it('PUT válido responde 200 con los valores, quedan guardados y son del comercio', async () => {
    const r = await ajustes({ batteryBelowPct: 35, voidAtLeastAmount: '2500' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ batteryBelowPct: 35, voidAtLeastAmount: '2500' });
    expect((await get(SETTINGS, supervisor)).json()).toEqual({ batteryBelowPct: 35, voidAtLeastAmount: '2500' });
    const ajeno = await comercioAjeno(h);
    expect((await get(SETTINGS, ajeno)).json()).toEqual({ batteryBelowPct: 20, voidAtLeastAmount: '100000' });
  });
  it('acepta los bordes y rechaza lo inválido (400) sin cambiar nada', async () => {
    for (const ok of [{ batteryBelowPct: 1, voidAtLeastAmount: '1' }, { batteryBelowPct: 99, voidAtLeastAmount: '99999999' }]) {
      expect((await ajustes(ok)).statusCode).toBe(200);
    }
    const antes = (await get(SETTINGS)).json();
    for (const malo of [
      {}, { batteryBelowPct: 30 }, { voidAtLeastAmount: '1000' }, { batteryBelowPct: 0, voidAtLeastAmount: '1' }, { batteryBelowPct: 100, voidAtLeastAmount: '1' },
      { batteryBelowPct: 20.5, voidAtLeastAmount: '1' }, { batteryBelowPct: '20', voidAtLeastAmount: '1' }, { batteryBelowPct: 20, voidAtLeastAmount: '0' },
      { batteryBelowPct: 20, voidAtLeastAmount: '01' }, { batteryBelowPct: 20, voidAtLeastAmount: '-5' }, { batteryBelowPct: 20, voidAtLeastAmount: 5000 },
      { batteryBelowPct: 20, voidAtLeastAmount: '100000000' }, { batteryBelowPct: 20, voidAtLeastAmount: '1', merchantId: 'x' },
    ]) {
      const r = await ajustes(malo);
      expect(r.statusCode, JSON.stringify(malo)).toBe(400);
      expect(r.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
    expect((await get(SETTINGS)).json()).toEqual(antes);
  });
});

describe('A1/A12 · permisos y aislamiento por comercio', () => {
  const rutas: Array<[string, string, unknown?]> = [
    ['GET', BASE], ['POST', `${BASE}/id-1/read`], ['POST', `${BASE}/read-all`], ['GET', SETTINGS],
    ['PUT', SETTINGS, { batteryBelowPct: 20, voidAtLeastAmount: '1000' }],
  ];
  it('sin sesión → 401 en todas', async () => {
    for (const [method, url, payload] of rutas) {
      const r = await h.app.inject({ method: method as 'GET', url, payload: payload as object | undefined });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
    }
  });
  it('el cajero recibe 403 FORBIDDEN en todas, sin efecto', async () => {
    for (const [method, url, payload] of rutas) {
      const r = await h.app.inject({ method: method as 'GET', url, headers: cajero, payload: payload as object | undefined });
      expect(r.statusCode, `${method} ${url}`).toBe(403);
      expect(r.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM alert_settings').get()).toEqual({ n: 0 });
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM alert_reads').get()).toEqual({ n: 0 });
  });
  it('el supervisor lee y marca, pero no cambia umbrales (403, sin efecto)', async () => {
    expect((await alertas('', supervisor)).items).toHaveLength(2);
    const r = await ajustes({ batteryBelowPct: 50, voidAtLeastAmount: '1' }, supervisor);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect((await get(SETTINGS)).json()).toEqual({ batteryBelowPct: 20, voidAtLeastAmount: '100000' });
  });
  it('BOLA/IDOR: las alertas, su lectura y los umbrales de un comercio no tocan al otro', async () => {
    const ajeno = await comercioAjeno(h);
    await telemetria('t-ajeno', { connection: 'offline' });
    const suyas = await alertas('', ajeno);
    expect(suyas.items.map((a) => a.type)).toEqual(['terminal_offline']);
    expect(suyas.items[0]!.params).toMatchObject({ terminalId: 't-ajeno' });
    const mias = await alertas();
    expect(mias.items.map((a) => a.params.terminalId)).not.toContain('t-ajeno');
    expect(mias.items).toHaveLength(2);
    // leer una alerta ajena → 404 y sin fila de lectura
    expect((await post(`${BASE}/${suyas.items[0]!.id}/read`)).statusCode).toBe(404);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM alert_reads').get()).toEqual({ n: 0 });
    // read-all del comercio A no toca las del B
    expect((await post(`${BASE}/read-all`)).json()).toEqual({ marked: 2 });
    expect((await alertas('', ajeno)).unreadCount).toBe(1);
    // umbrales del A no cambian los del B
    await ajustes({ batteryBelowPct: 90, voidAtLeastAmount: '1' });
    expect((await get(SETTINGS, ajeno)).json()).toEqual({ batteryBelowPct: 20, voidAtLeastAmount: '100000' });
  });
  it('una anulación en el comercio A no crea alertas en el B', async () => {
    const ajeno = await comercioAjeno(h);
    await anular(await cobrar('300000'));
    expect((await alertas('', ajeno)).items.filter((a) => a.type === 'void_over_threshold')).toHaveLength(0);
  });
});
