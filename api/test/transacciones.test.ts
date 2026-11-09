import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, type Harness, login, loginToken, makeApp, tokenOf, withCookie } from './helpers/app';

const BASE = '/api/v1/transactions';
const HORA = 3_600_000;
const CLAVES = ['amount', 'authCode', 'brand', 'cashierId', 'createdAt', 'folio', 'id', 'last4', 'method', 'refundedAmount',
  'responseCode', 'status', 'terminalId'].sort();
const CLAVES_COMPROBANTE = ['amount', 'authCode', 'brand', 'createdAt', 'folio', 'last4', 'merchantName', 'method',
  'refundedAmount', 'status', 'terminalAlias'];
const BARRA = 'term-demo-0001';
const INACTIVA = 'term-demo-0003';

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

type Body = Record<string, unknown>;
const cobro = (over: Body = {}): Body => ({
  requestId: randomUUID(), terminalId: BARRA, amount: '12500', method: 'card', brand: 'visa', last4: '4242', ...over,
});
const cobrar = (payload: unknown, headers = admin) =>
  h.app.inject({ method: 'POST', url: BASE, headers, payload: payload as object });
const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const accion = (id: string, what: 'void' | 'refund', payload?: unknown, headers = admin) =>
  h.app.inject({ method: 'POST', url: `${BASE}/${id}/${what}`, headers, payload: payload as object | undefined });
const anular = (id: string, headers = admin) => accion(id, 'void', undefined, headers);
const devolver = (id: string, amount: unknown, headers = admin) => accion(id, 'refund', { amount }, headers);
const inyectar = (over: Body = {}) =>
  h.app.inject({
    method: 'POST', url: '/__test__/transactions',
    payload: { terminalId: BARRA, cashierId: 'user-admin', amount: '1000', method: 'card', brand: 'visa', last4: '4242',
      status: 'approved', createdAt: 1_700_000_000_000, ...over },
  });
const lista = async (qs = '', headers = admin) => {
  const r = await get(`${BASE}${qs}`, headers);
  expect(r.statusCode, qs).toBe(200);
  return r.json() as { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
};
const nuevaAprobada = async (over: Body = {}, headers = admin) => {
  const r = await cobrar(cobro(over), headers);
  expect(r.statusCode).toBe(201);
  return r.json() as Record<string, unknown> & { id: string };
};
// La sesión vence a las 8 h (S6): tras mover el reloj más que eso hay que volver a entrar.
const reingresar = async () => { admin = withCookie(tokenOf(await login(h, 'admin@pippos.test'))); };
const filas = () => (h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
const estadoEnBd = (id: string) => h.db.prepare('SELECT status, refunded FROM transactions WHERE id = ?').get(id);

// Segundo comercio con un usuario que puede iniciar sesión (FakeHasher: `h:<clave>`) y un terminal propio.
async function comercioAjeno(): Promise<Record<string, string>> {
  h.db.prepare("INSERT INTO merchants (id, name) VALUES ('m-ajeno', 'Otro comercio')").run();
  h.db.prepare(
    `INSERT INTO users (id, merchant_id, name, email, role, password_hash, language, theme)
     VALUES ('u-ajeno', 'm-ajeno', 'Ajeno', 'ajeno@otro.test', 'admin', ?, 'es', 'light')`,
  ).run(`h:${DEMO_PASSWORD}`);
  h.db.prepare(
    `INSERT INTO terminals (id, merchant_id, serial, alias, model, branch, till, status, firmware, battery_pct, connection, created_at_ms)
     VALUES ('t-ajeno','m-ajeno','AJENO-0001','x','x','x','x','active','1.4.2',50,'online',1)`,
  ).run();
  return withCookie(tokenOf(await login(h, 'ajeno@otro.test')));
}

describe('C1 permisos y aislamiento', () => {
  it('sin sesión: 401 en todas las rutas', async () => {
    const id = (await nuevaAprobada()).id;
    for (const res of [await cobrar(cobro(), {}), await get(BASE, {}), await get(`${BASE}/${id}`, {}),
      await accion(id, 'void', undefined, {}), await accion(id, 'refund', { amount: '1' }, {}), await get(`${BASE}/${id}/receipt`, {})]) {
      expect(res.statusCode).toBe(401);
    }
  });
  it('admin, supervisor y cajero pueden cobrar', async () => {
    for (const quien of [admin, supervisor, cajero]) expect((await cobrar(cobro(), quien)).statusCode).toBe(201);
  });
  it('cajero: 403 FORBIDDEN al anular y devolver, y la transacción no cambia', async () => {
    const t = await nuevaAprobada({}, cajero);
    for (const res of [await anular(t.id, cajero), await devolver(t.id, '100', cajero)]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    expect(estadoEnBd(t.id)).toEqual({ status: 'approved', refunded: 0 });
  });
  it('supervisor y admin anulan y devuelven', async () => {
    const a = await nuevaAprobada();
    const b = await nuevaAprobada();
    expect((await anular(a.id, supervisor)).statusCode).toBe(200);
    expect((await devolver(b.id, '100', admin)).statusCode).toBe(200);
  });
  it('el cajero solo ve lo suyo (lista, detalle y comprobante); admin y supervisor ven todo', async () => {
    const suya = await nuevaAprobada({}, cajero);
    const ajena = await nuevaAprobada({}, admin);
    expect((await lista('', cajero)).items.map((t) => t.id)).toEqual([suya.id]);
    expect((await lista('', cajero)).total).toBe(1);
    expect((await lista('', admin)).total).toBe(2);
    expect((await lista('', supervisor)).total).toBe(2);
    expect((await get(`${BASE}/${suya.id}`, cajero)).statusCode).toBe(200);
    for (const url of [`${BASE}/${ajena.id}`, `${BASE}/${ajena.id}/receipt`]) {
      const res = await get(url, cajero);
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    expect((await get(`${BASE}/${ajena.id}`, supervisor)).statusCode).toBe(200);
  });
  it('el cajero no puede anular ni devolver lo ajeno aunque lo intente (403, no 404 ni efecto)', async () => {
    const ajena = await nuevaAprobada({}, admin);
    expect((await anular(ajena.id, cajero)).statusCode).toBe(403);
    expect(estadoEnBd(ajena.id)).toEqual({ status: 'approved', refunded: 0 });
  });
  it('otro comercio: terminal, detalle, anulación, devolución y comprobante → 404; la lista no lo muestra', async () => {
    const ajeno = await comercioAjeno();
    const suya = (await cobrar(cobro({ terminalId: 't-ajeno' }), ajeno)).json();
    expect(suya.folio).toBe(1);
    const mia = await nuevaAprobada();
    expect((await cobrar(cobro({ terminalId: 't-ajeno' }), admin)).statusCode).toBe(404);
    expect((await cobrar(cobro({ terminalId: BARRA }), ajeno)).statusCode).toBe(404);
    for (const res of [await get(`${BASE}/${suya.id}`, admin), await anular(suya.id, admin), await devolver(suya.id, '1', admin),
      await get(`${BASE}/${suya.id}/receipt`, admin), await get(`${BASE}/${mia.id}`, ajeno)]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    expect((await lista('', admin)).items.map((t) => t.id)).toEqual([mia.id]);
    expect((await lista('', ajeno)).items.map((t) => t.id)).toEqual([suya.id]);
    expect(estadoEnBd(suya.id)).toEqual({ status: 'approved', refunded: 0 });
  });
  it('petición con efecto y Origin ajeno: 403 ORIGIN_NOT_ALLOWED y nada se crea', async () => {
    const res = await cobrar(cobro(), { ...admin, origin: 'http://evil.test' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(filas()).toBe(0);
  });
});

describe('C2 cobrar: validación', () => {
  const MALOS: Array<[string, Body]> = [
    ['sin requestId', { requestId: undefined }], ['requestId no UUID', { requestId: 'abc' }], ['requestId numérico', { requestId: 5 }],
    ['sin terminalId', { terminalId: undefined }], ['terminalId numérico', { terminalId: 5 }],
    ['sin amount', { amount: undefined }], ['amount 0', { amount: '0' }], ['amount negativo', { amount: '-5' }],
    ['amount decimal', { amount: '1.5' }], ['amount con ceros a la izquierda', { amount: '012' }], ['amount texto', { amount: 'abc' }],
    ['amount 9 dígitos', { amount: '100000000' }], ['amount como número', { amount: 12500 }], ['amount vacío', { amount: '' }],
    ['method desconocido', { method: 'cash' }], ['sin method', { method: undefined }],
    ['brand desconocida', { brand: 'diners' }], ['brand en mayúsculas', { brand: 'VISA' }], ['sin brand', { brand: undefined }],
    ['last4 de 3', { last4: '123' }], ['last4 de 5', { last4: '12345' }], ['last4 con letras', { last4: 'abcd' }],
    ['last4 numérico', { last4: 1234 }], ['sin last4', { last4: undefined }],
    ['campo status', { status: 'approved' }], ['campo cashierId', { cashierId: 'user-admin' }],
    ['campo merchantId', { merchantId: 'm' }], ['campo folio', { folio: 99 }], ['campo pan', { pan: '4242424242424242' }],
  ];
  it.each(MALOS)('%s → 400 VALIDATION_ERROR y no se crea nada', async (_n, over) => {
    const res = await cobrar(cobro(over));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(filas()).toBe(0);
  });
  it('cuerpo que no es objeto → 400', async () => {
    for (const body of [[], [1]]) expect((await cobrar(body)).statusCode).toBe(400);
    expect(filas()).toBe(0);
  });
  it('terminal inexistente → 404; terminal inactiva → 409 CONFLICT; nada se crea', async () => {
    expect((await cobrar(cobro({ terminalId: 'no-existe' }))).statusCode).toBe(404);
    const res = await cobrar(cobro({ terminalId: INACTIVA }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
    expect(filas()).toBe(0);
  });
  it('los fallos de validación no consumen folio', async () => {
    await cobrar(cobro({ amount: '0' }));
    expect((await nuevaAprobada()).folio).toBe(1);
  });
});

describe('C3/C4 resultado del switch', () => {
  it('aprobada: 201, forma exacta, valores y created con el cajero de la sesión', async () => {
    h.clock.advance(5000);
    const body = cobro({ method: 'wallet', brand: 'amex', amount: '99999999', last4: '1111' });
    const res = await cobrar(body, cajero);
    expect(res.statusCode).toBe(201);
    const t = res.json();
    expect(Object.keys(t).sort()).toEqual(CLAVES);
    expect(t).toMatchObject({
      terminalId: BARRA, cashierId: 'user-cajero', amount: '99999999', refundedAmount: '0',
      method: 'wallet', brand: 'amex', last4: '1111', status: 'approved', responseCode: '00', folio: 1, createdAt: 1_700_000_005_000,
    });
    expect(t.authCode).toMatch(/^\d{6}$/);
    expect(typeof t.id).toBe('string');
  });
  it('amount mínimo "1" y máximo "99999999" viajan como string exacto (I3)', async () => {
    expect((await nuevaAprobada({ amount: '1' })).amount).toBe('1');
    const t = await nuevaAprobada({ amount: '99999999' });
    expect(t.amount).toBe('99999999');
    expect(((await get(`${BASE}/${t.id}`)).json() as Body).amount).toBe('99999999');
  });
  it.each([['0051', '51'], ['0005', '05']])('last4 %s → 201 declined con responseCode %s', async (last4, code) => {
    const res = await cobrar(cobro({ last4 }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'declined', responseCode: code, authCode: null, refundedAmount: '0' });
  });
  it('last4 0408 → 201 timeout sin códigos', async () => {
    const res = await cobrar(cobro({ last4: '0408' }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'timeout', responseCode: null, authCode: null });
  });
  it('cualquier método y marca con last4 normal se aprueba', async () => {
    for (const method of ['card', 'wallet']) for (const brand of ['visa', 'mastercard', 'amex']) {
      expect((await nuevaAprobada({ method, brand })).status).toBe('approved');
    }
  });
  it('folio correlativo por comercio sin huecos; rechazos y timeouts también lo consumen', async () => {
    const folios: unknown[] = [];
    for (const last4 of ['4242', '0051', '0408', '4242']) folios.push((await cobrar(cobro({ last4 }))).json().folio);
    expect(folios).toEqual([1, 2, 3, 4]);
  });
  it('lo que sale nunca trae un PAN: solo last4', async () => {
    const t = await nuevaAprobada();
    expect(JSON.stringify(t)).not.toMatch(/\d{15,}/);
    const fila = h.db.prepare('SELECT * FROM transactions WHERE id = ?').get(t.id) as Body;
    expect(JSON.stringify(fila)).not.toMatch(/\d{15,}/);
  });
});

describe('C5 idempotencia', () => {
  it('mismo requestId y mismo cuerpo → 200 con la misma transacción, sin segundo cobro ni folio', async () => {
    const body = cobro();
    const a = await cobrar(body);
    const b = await cobrar(body);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    expect(filas()).toBe(1);
    expect((await nuevaAprobada()).folio).toBe(2);
  });
  it('también repite el rechazo y el timeout sin volver a llamar al switch', async () => {
    for (const last4 of ['0051', '0408']) {
      const body = cobro({ last4 });
      const a = await cobrar(body);
      const b = await cobrar(body);
      expect(b.statusCode).toBe(200);
      expect(b.json()).toEqual(a.json());
    }
    expect(filas()).toBe(2);
  });
  it('mismo requestId con cuerpo distinto → 409 CONFLICT y nada cambia', async () => {
    const body = cobro();
    await cobrar(body);
    for (const cambio of [{ amount: '1' }, { last4: '0051' }, { brand: 'amex' }, { method: 'wallet' }, { terminalId: 'term-demo-0002' }]) {
      const res = await cobrar({ ...body, ...cambio });
      expect(res.statusCode, JSON.stringify(cambio)).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    }
    expect(filas()).toBe(1);
  });
  it('cinco peticiones simultáneas con el mismo requestId crean UNA sola transacción', async () => {
    const body = cobro();
    const res = await Promise.all([1, 2, 3, 4, 5].map(() => cobrar(body)));
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(res.map((r) => r.json().id)).size).toBe(1);
    expect(filas()).toBe(1);
  });
  it('el requestId es por comercio', async () => {
    const ajeno = await comercioAjeno();
    const body = cobro();
    expect((await cobrar(body)).statusCode).toBe(201);
    const res = await cobrar({ ...body, terminalId: 't-ajeno' }, ajeno);
    expect(res.statusCode).toBe(201);
    expect(res.json().folio).toBe(1);
    expect(filas()).toBe(2);
  });
});

describe('C6 lista y filtros', () => {
  const T0 = 1_700_000_000_000;
  async function poblar() {
    await inyectar({ amount: '1000', status: 'approved', method: 'card', brand: 'visa', createdAt: T0 + 1000 });
    await inyectar({ amount: '2000', status: 'declined', method: 'wallet', brand: 'mastercard', createdAt: T0 + 2000 });
    await inyectar({ amount: '3000', status: 'approved', method: 'card', brand: 'amex', terminalId: 'term-demo-0002', createdAt: T0 + 3000 });
    await inyectar({ amount: '4000', status: 'timeout', method: 'wallet', brand: 'visa', createdAt: T0 + 3000 });
    await inyectar({ amount: '500', status: 'voided', method: 'card', brand: 'visa', createdAt: T0 });
  }
  const folios = async (qs: string) => (await lista(qs)).items.map((t) => t.folio);

  it('vacía: items [], total 0, page 1, pageSize 20', async () => {
    expect(await lista()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
  it('más reciente primero; empate por folio mayor; forma de cada item', async () => {
    await poblar();
    const l = await lista();
    expect(l.items.map((t) => t.folio)).toEqual([4, 3, 2, 1, 5]);
    expect(l.total).toBe(5);
    expect(Object.keys(l.items[0]!).sort()).toEqual(CLAVES);
  });
  it('filtros por status, method, brand y terminalId', async () => {
    await poblar();
    expect(await folios('?status=approved')).toEqual([3, 1]);
    expect(await folios('?status=voided')).toEqual([5]);
    expect(await folios('?method=wallet')).toEqual([4, 2]);
    expect(await folios('?brand=visa')).toEqual([4, 1, 5]);
    expect(await folios('?terminalId=term-demo-0002')).toEqual([3]);
    expect(await folios('?terminalId=no-existe')).toEqual([]);
  });
  it('from/to inclusivos y min/max inclusivos', async () => {
    await poblar();
    expect(await folios(`?from=${T0 + 2000}`)).toEqual([4, 3, 2]);
    expect(await folios(`?to=${T0 + 1000}`)).toEqual([1, 5]);
    expect(await folios(`?from=${T0 + 1000}&to=${T0 + 2000}`)).toEqual([2, 1]);
    expect(await folios('?min=2000')).toEqual([4, 3, 2]);
    expect(await folios('?max=1000')).toEqual([1, 5]);
    expect(await folios('?min=1000&max=3000')).toEqual([3, 2, 1]);
  });
  it('los filtros se combinan con Y', async () => {
    await poblar();
    expect(await folios('?method=card&brand=visa&status=approved')).toEqual([1]);
    expect(await folios(`?status=approved&min=2000&from=${T0}`)).toEqual([3]);
    expect(await folios('?status=declined&method=card')).toEqual([]);
  });
  it('min/max comparan como números, no como texto', async () => {
    await inyectar({ amount: '9' });
    await inyectar({ amount: '100' });
    expect(await folios('?min=50')).toEqual([2]);
    expect(await folios('?max=50')).toEqual([1]);
  });
  it('paginación: defecto 20, páginas, total y pageSize devueltos', async () => {
    for (let i = 1; i <= 25; i++) await inyectar({ createdAt: T0 + i });
    const p1 = await lista();
    expect(p1).toMatchObject({ total: 25, page: 1, pageSize: 20 });
    expect(p1.items).toHaveLength(20);
    const p2 = await lista('?page=2');
    expect(p2.items.map((t) => t.folio)).toEqual([5, 4, 3, 2, 1]);
    const chica = await lista('?pageSize=10&page=3');
    expect(chica).toMatchObject({ total: 25, page: 3, pageSize: 10 });
    expect(chica.items.map((t) => t.folio)).toEqual([5, 4, 3, 2, 1]);
    expect((await lista('?pageSize=100')).items).toHaveLength(25);
    expect((await lista('?page=9')).items).toEqual([]);
  });
  it('parámetros inválidos o desconocidos → 400 VALIDATION_ERROR', async () => {
    for (const qs of ['?page=0', '?page=-1', '?page=x', '?pageSize=0', '?pageSize=101', '?status=x', '?method=x', '?brand=x',
      '?from=abc', '?to=1.5', '?min=1.5', '?max=-1', '?min=abc', '?terminalId=', '?foo=1', '?cashierId=user-admin']) {
      const res = await get(`${BASE}${qs}`);
      expect(res.statusCode, qs).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('C7 detalle y eventos', () => {
  it('404 si no existe (y el detalle de una real sí responde 200)', async () => {
    expect((await get(`${BASE}/${(await nuevaAprobada()).id}`)).statusCode).toBe(200);
    const res = await get(`${BASE}/no-existe`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
  it('aprobada: la transacción más events [created] con monto, instante y usuario', async () => {
    h.clock.advance(7000);
    const t = await nuevaAprobada({ amount: '4200' }, cajero);
    const d = (await get(`${BASE}/${t.id}`, cajero)).json();
    expect(Object.keys(d).sort()).toEqual([...CLAVES, 'events'].sort());
    expect({ ...d, events: undefined }).toEqual({ ...t, events: undefined });
    expect(d.events).toEqual([{ kind: 'created', amount: '4200', at: 1_700_000_007_000, byUserId: 'user-cajero' }]);
  });
  it('rechazada y timeout también registran created', async () => {
    for (const last4 of ['0051', '0408']) {
      const t = (await cobrar(cobro({ last4 }))).json();
      expect((await get(`${BASE}/${t.id}`)).json().events.map((e: { kind: string }) => e.kind)).toEqual(['created']);
    }
  });
  it('devoluciones y anulación se agregan en orden con su usuario', async () => {
    const a = await nuevaAprobada({ amount: '1000' });
    h.clock.advance(1000);
    await devolver(a.id, '300', supervisor);
    h.clock.advance(1000);
    await devolver(a.id, '200', admin);
    const ev = (await get(`${BASE}/${a.id}`)).json().events;
    expect(ev).toEqual([
      { kind: 'created', amount: '1000', at: 1_700_000_000_000, byUserId: 'user-admin' },
      { kind: 'refunded', amount: '300', at: 1_700_000_001_000, byUserId: 'user-supervisor' },
      { kind: 'refunded', amount: '200', at: 1_700_000_002_000, byUserId: 'user-admin' },
    ]);
    const b = await nuevaAprobada({ amount: '800' });
    h.clock.advance(500);
    await anular(b.id, supervisor);
    expect((await get(`${BASE}/${b.id}`)).json().events.at(-1)).toEqual({
      kind: 'voided', amount: '800', at: 1_700_000_002_500, byUserId: 'user-supervisor',
    });
  });
});

describe('C8 anular', () => {
  it('approved → voided: 200 con la transacción', async () => {
    const t = await nuevaAprobada();
    const res = await anular(t.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: t.id, status: 'voided', refundedAmount: '0', amount: '12500' });
    expect(estadoEnBd(t.id)).toEqual({ status: 'voided', refunded: 0 });
  });
  it('una vez anulada no admite anular ni devolver (409 CONFLICT)', async () => {
    const t = await nuevaAprobada();
    await anular(t.id);
    for (const res of [await anular(t.id), await devolver(t.id, '1')]) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    }
  });
  it('con una devolución previa (aunque sea parcial) ya no se anula', async () => {
    const t = await nuevaAprobada();
    await devolver(t.id, '1');
    expect((await anular(t.id)).statusCode).toBe(409);
    expect(estadoEnBd(t.id)).toEqual({ status: 'partially_refunded', refunded: 1 });
  });
  it('24 h: a 24 h − 1 ms todavía; a las 24 h exactas, 409', async () => {
    const a = await nuevaAprobada();
    const b = await nuevaAprobada();
    h.clock.advance(24 * HORA - 1);
    await reingresar();
    expect((await anular(a.id)).statusCode).toBe(200);
    h.clock.advance(1);
    expect((await anular(b.id)).statusCode).toBe(409);
    expect(estadoEnBd(b.id)).toEqual({ status: 'approved', refunded: 0 });
  });
  it('declined y timeout son finales: 409 al anular y al devolver', async () => {
    for (const last4 of ['0051', '0005', '0408']) {
      const t = (await cobrar(cobro({ last4 }))).json();
      expect((await anular(t.id)).statusCode, last4).toBe(409);
      expect((await devolver(t.id, '1')).statusCode, last4).toBe(409);
    }
  });
  it('id inexistente → 404 (con una transacción real que sí se puede anular)', async () => {
    expect((await anular((await nuevaAprobada()).id)).statusCode).toBe(200);
    expect((await anular('no-existe')).statusCode).toBe(404);
    expect((await devolver('no-existe', '1')).statusCode).toBe(404);
  });
});

describe('C8 devolver', () => {
  it('parcial → partially_refunded y acumula; al completar → refunded', async () => {
    const t = await nuevaAprobada({ amount: '12500' });
    let res = await devolver(t.id, '5000');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'partially_refunded', refundedAmount: '5000', amount: '12500' });
    res = await devolver(t.id, '2500');
    expect(res.json()).toMatchObject({ status: 'partially_refunded', refundedAmount: '7500' });
    res = await devolver(t.id, '5000');
    expect(res.json()).toMatchObject({ status: 'refunded', refundedAmount: '12500' });
    expect(estadoEnBd(t.id)).toEqual({ status: 'refunded', refunded: 12500 });
  });
  it('devolución total de una vez → refunded', async () => {
    const t = await nuevaAprobada({ amount: '700' });
    expect((await devolver(t.id, '700')).json()).toMatchObject({ status: 'refunded', refundedAmount: '700' });
  });
  it('pasarse por 1 → 409 y no cambia; completa ya no admite más', async () => {
    const t = await nuevaAprobada({ amount: '1000' });
    expect((await devolver(t.id, '1001')).statusCode).toBe(409);
    await devolver(t.id, '600');
    const res = await devolver(t.id, '401');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
    expect(estadoEnBd(t.id)).toEqual({ status: 'partially_refunded', refunded: 600 });
    await devolver(t.id, '400');
    expect((await devolver(t.id, '1')).statusCode).toBe(409);
    expect(estadoEnBd(t.id)).toEqual({ status: 'refunded', refunded: 1000 });
  });
  it('devolver no tiene límite de tiempo (a diferencia de anular)', async () => {
    const t = await nuevaAprobada();
    h.clock.advance(48 * HORA);
    await reingresar();
    expect((await devolver(t.id, '100')).statusCode).toBe(200);
  });
  it('monto mal formado o campos extra → 400 y no cambia', async () => {
    const t = await nuevaAprobada();
    for (const cuerpo of [{}, { amount: '0' }, { amount: '-1' }, { amount: '1.5' }, { amount: 'abc' }, { amount: 5000 }, { amount: '' },
      { amount: '012' }, { amount: '100000000' }, { amount: '100', status: 'refunded' }, { amount: '100', refundedAmount: '0' }]) {
      const res = await accion(t.id, 'refund', cuerpo);
      expect(res.statusCode, JSON.stringify(cuerpo)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(estadoEnBd(t.id)).toEqual({ status: 'approved', refunded: 0 });
  });
  it('anular acepta un cuerpo vacío pero no campos que cambien el resultado', async () => {
    const t = await nuevaAprobada();
    expect((await accion(t.id, 'void', { status: 'refunded' })).statusCode).toBe(400);
    expect(estadoEnBd(t.id)).toEqual({ status: 'approved', refunded: 0 });
  });
});

describe('C9 invariantes de dinero bajo concurrencia', () => {
  it('I1/I2: dos devoluciones simultáneas que juntas se pasan → una gana, la otra 409', async () => {
    const t = await nuevaAprobada({ amount: '12500' });
    const res = await Promise.all([devolver(t.id, '8000'), devolver(t.id, '8000')]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(estadoEnBd(t.id)).toEqual({ status: 'partially_refunded', refunded: 8000 });
  });
  it('I1: diez devoluciones de 100 sobre 500 → exactamente cinco pasan y queda refunded', async () => {
    const t = await nuevaAprobada({ amount: '500' });
    const res = await Promise.all(Array.from({ length: 10 }, () => devolver(t.id, '100')));
    expect(res.filter((r) => r.statusCode === 200)).toHaveLength(5);
    expect(res.filter((r) => r.statusCode === 409)).toHaveLength(5);
    expect(estadoEnBd(t.id)).toEqual({ status: 'refunded', refunded: 500 });
  });
  it('I2: dos anulaciones simultáneas → una 200 y una 409; hay un solo evento voided', async () => {
    const t = await nuevaAprobada();
    const res = await Promise.all([anular(t.id), anular(t.id)]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const n = h.db.prepare("SELECT COUNT(*) AS n FROM transaction_events WHERE transaction_id = ? AND kind = 'voided'").get(t.id) as { n: number };
    expect(n.n).toBe(1);
  });
  it('I4: anular y devolver a la vez → solo una transición ocurre', async () => {
    const t = await nuevaAprobada();
    const res = await Promise.all([anular(t.id), devolver(t.id, '100')]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const fila = estadoEnBd(t.id) as { status: string; refunded: number };
    expect(['voided', 'partially_refunded']).toContain(fila.status);
    expect(fila.refunded).toBe(fila.status === 'voided' ? 0 : 100);
  });
  it('I1 en la base: refunded nunca supera amount', async () => {
    const t = await nuevaAprobada({ amount: '300' });
    await Promise.all([devolver(t.id, '200'), devolver(t.id, '200'), devolver(t.id, '100')]);
    const f = h.db.prepare('SELECT amount, refunded FROM transactions WHERE id = ?').get(t.id) as { amount: number; refunded: number };
    expect(f.refunded).toBeLessThanOrEqual(f.amount);
    expect(f.refunded).toBeGreaterThanOrEqual(0);
  });
});

describe('C10 comprobante', () => {
  it('aprobada: forma exacta, sin ids internos ni PAN', async () => {
    const t = await nuevaAprobada({ amount: '4200', method: 'wallet', brand: 'mastercard', last4: '1234' });
    const res = await get(`${BASE}/${t.id}/receipt`);
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(Object.keys(r).sort()).toEqual([...CLAVES_COMPROBANTE].sort());
    expect(r).toEqual({
      folio: 1, merchantName: 'Boliche La Noche', terminalAlias: 'Barra', amount: '4200', refundedAmount: '0', method: 'wallet',
      brand: 'mastercard', last4: '1234', status: 'approved', authCode: t.authCode, createdAt: 1_700_000_000_000,
    });
  });
  it('voided, partially_refunded y refunded también tienen comprobante con su estado y lo devuelto', async () => {
    const a = await nuevaAprobada();
    const b = await nuevaAprobada({ amount: '1000' });
    const c = await nuevaAprobada({ amount: '1000' });
    await anular(a.id);
    await devolver(b.id, '400');
    await devolver(c.id, '1000');
    expect((await get(`${BASE}/${a.id}/receipt`)).json()).toMatchObject({ status: 'voided', refundedAmount: '0' });
    expect((await get(`${BASE}/${b.id}/receipt`)).json()).toMatchObject({ status: 'partially_refunded', refundedAmount: '400' });
    expect((await get(`${BASE}/${c.id}/receipt`)).json()).toMatchObject({ status: 'refunded', refundedAmount: '1000' });
  });
  it('declined y timeout → 409 CONFLICT; id inexistente → 404', async () => {
    for (const last4 of ['0051', '0408']) {
      const t = (await cobrar(cobro({ last4 }))).json();
      const res = await get(`${BASE}/${t.id}/receipt`);
      expect(res.statusCode, last4).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    }
    expect((await get(`${BASE}/no-existe/receipt`)).statusCode).toBe(404);
  });
});

describe('C11 costuras de pruebas', () => {
  it('sin flag: POST /__test__/transactions → 404 NOT_FOUND y no inserta', async () => {
    const sin = await makeApp({ enableTestRoutes: false });
    const res = await sin.app.inject({
      method: 'POST', url: '/__test__/transactions',
      payload: { terminalId: BARRA, cashierId: 'user-admin', amount: '1', method: 'card', brand: 'visa', last4: '4242', status: 'approved', createdAt: 1 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect((sin.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n).toBe(0);
  });
  it('inserta resuelta: 201 con la transacción, folio correlativo y códigos según status', async () => {
    const a = await inyectar({ status: 'approved', amount: '5000', createdAt: 123 });
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({ folio: 1, status: 'approved', responseCode: '00', amount: '5000', refundedAmount: '0', createdAt: 123, cashierId: 'user-admin' });
    expect(a.json().authCode).toMatch(/^\d{6}$/);
    expect((await inyectar({ status: 'declined' })).json()).toMatchObject({ folio: 2, responseCode: '51', authCode: null });
    expect((await inyectar({ status: 'timeout' })).json()).toMatchObject({ folio: 3, responseCode: null, authCode: null });
    const p = await inyectar({ status: 'partially_refunded', refundedAmount: '400', amount: '1000' });
    expect(p.json()).toMatchObject({ status: 'partially_refunded', refundedAmount: '400' });
    expect((await get(`${BASE}/${a.json().id}`)).statusCode).toBe(200);
  });
  it('estricto: campo extra, status desconocido, monto malo → 400; terminal desconocido → 404', async () => {
    for (const over of [{ extra: 1 }, { status: 'raro' }, { amount: '0' }, { createdAt: 'x' }, { method: 'cash' }, { last4: '12' }]) {
      expect((await inyectar(over)).statusCode, JSON.stringify(over)).toBe(400);
    }
    expect((await inyectar({ terminalId: 'no-existe' })).statusCode).toBe(404);
    expect(filas()).toBe(0);
  });
  it('/__test__/reset borra transacciones y eventos y reinicia el folio', async () => {
    await nuevaAprobada();
    await inyectar();
    expect((await h.app.inject({ method: 'POST', url: '/__test__/reset' })).statusCode).toBe(204);
    expect(filas()).toBe(0);
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM transaction_events').get() as { n: number }).n).toBe(0);
    const token = await loginToken(h, 'admin');
    const t = await cobrar(cobro(), withCookie(token));
    expect(t.statusCode).toBe(201);
    expect(t.json().folio).toBe(1);
  });
  it('el reloj de pruebas rige los 24 h de la anulación', async () => {
    const t = await nuevaAprobada();
    expect((await h.app.inject({ method: 'POST', url: '/__test__/clock', payload: { advanceMs: 24 * HORA } })).statusCode).toBe(204);
    await reingresar();
    expect((await anular(t.id)).statusCode).toBe(409);
  });
});
