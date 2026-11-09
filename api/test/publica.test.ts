import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, IDEM, bearer, comercioAjeno, crearLlave, loginToken, makeApp, sinCorrelacion, withCookie } from './helpers/app';
import { codificarCursor } from '../src/domain/apikey';

const P = '/public/v1';
const TERMINALES = ['term-demo-0001', 'term-demo-0002', 'term-demo-0003'];
const CAJEROS = ['user-admin', 'user-supervisor', 'user-cajero'];
const T0 = Date.UTC(2024, 0, 10, 12, 0, 0);
const COBRO = { terminalId: 'term-demo-0001', amount: '1500', method: 'card', brand: 'visa', last4: '1111' };

let h: Harness;
let admin: Record<string, string>;
let lectura: Record<string, string>;
let escritura: Record<string, string>;

beforeEach(async () => {
  h = await makeApp({ enableTestRoutes: true });
  admin = withCookie(await loginToken(h, 'admin'));
  lectura = bearer((await crearLlave(h, admin, 'read', 'lectura')).key);
  escritura = bearer((await crearLlave(h, admin, 'write', 'escritura')).key);
});

type Body = Record<string, unknown>;
const pub = (url: string, headers = lectura) => h.app.inject({ method: 'GET', url: `${P}${url}`, headers });
const interno = (url: string) => h.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: admin });
const cobrar = (payload: unknown, idem: string | null = IDEM(), headers = escritura) =>
  h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: idem === null ? headers : { ...headers, 'idempotency-key': idem }, payload: payload as object });
const filas = () => (h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
const inyectar = async (over: Body = {}) => {
  const r = await h.app.inject({
    method: 'POST', url: '/__test__/transactions',
    payload: { terminalId: TERMINALES[0], cashierId: CAJEROS[0], amount: '1000', method: 'card', brand: 'visa', last4: '4242', status: 'approved', createdAt: T0, ...over },
  });
  expect(r.statusCode, JSON.stringify(over)).toBe(201);
  return r.json() as { id: string; folio: number; createdAt: number };
};

// Oráculo independiente: toda la lista interna (por páginas) ordenada aquí con (createdAt, folio) descendente.
async function oraculo(query = ''): Promise<Array<Body & { folio: number; createdAt: number }>> {
  const todas: Array<Body & { folio: number; createdAt: number }> = [];
  for (let page = 1; ; page++) {
    const r = await interno(`/transactions?page=${page}&pageSize=100${query}`);
    const b = r.json() as { items: typeof todas; total: number };
    todas.push(...b.items);
    if (todas.length >= b.total) break;
  }
  return todas.sort((a, b) => b.createdAt - a.createdAt || b.folio - a.folio);
}
async function recorrer(query: string, limit: number): Promise<{ folios: number[]; paginas: number }> {
  const folios: number[] = [];
  let cursor: string | null | undefined;
  let paginas = 0;
  do {
    const r = await pub(`/transactions?limit=${limit}${query}${cursor ? `&cursor=${cursor}` : ''}`);
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json() as { items: Array<{ folio: number }>; nextCursor: string | null };
    expect(b.items.length).toBeLessThanOrEqual(limit);
    folios.push(...b.items.map((i) => i.folio));
    cursor = b.nextCursor;
    paginas++;
    expect(paginas).toBeLessThan(200);
  } while (cursor);
  return { folios, paginas };
}

describe('K4 · lectura: misma forma y reglas que /api/v1', () => {
  it('terminales, detalle de terminal, resumen, ventas y detalle de transacción son idénticos a los internos', async () => {
    const tx = await inyectar({ cashierId: 'user-cajero', amount: '2500' });
    await inyectar({ status: 'declined', terminalId: TERMINALES[1], createdAt: T0 + 5_000 });
    const rango = `from=${Date.UTC(2024, 0, 9)}&to=${Date.UTC(2024, 0, 17) - 1}&tzOffsetMin=-180`;
    const pares: Array<[string, string]> = [
      ['/terminals', '/terminals'], ['/terminals/term-demo-0002', '/terminals/term-demo-0002'],
      [`/reports/summary?${rango}&compare=true`, `/reports/summary?${rango}&compare=true`],
      [`/reports/sales?${rango}&groupBy=day`, `/reports/sales?${rango}&groupBy=day`],
      [`/transactions/${tx.id}`, `/transactions/${tx.id}`],
    ];
    for (const [publica, interna] of pares) {
      const a = await pub(publica);
      const b = await interno(interna);
      expect(a.statusCode, publica).toBe(200);
      expect(a.json(), publica).toEqual(b.json());
    }
  });
  it('la llave ve las transacciones de TODOS los cajeros del comercio', async () => {
    const ajena = await inyectar({ cashierId: 'user-cajero' });
    expect((await pub(`/transactions/${ajena.id}`)).statusCode).toBe(200);
    const b = (await pub('/transactions')).json() as { items: Array<{ id: string }> };
    expect(b.items.map((i) => i.id)).toContain(ajena.id);
  });
  it('un id desconocido → 404 NOT_FOUND', async () => {
    for (const url of ['/terminals/nada', '/transactions/nada']) {
      const r = await pub(url);
      expect(r.statusCode, url).toBe(404);
      expect(sinCorrelacion(r)).toEqual({ error: { code: 'NOT_FOUND' } });
    }
  });
  it('lo que la API pública no tiene → 404 aunque la llave sea de escritura', async () => {
    const rutas: Array<[string, string]> = [
      ['POST', '/transactions/x/void'], ['POST', '/transactions/x/refund'], ['GET', '/users'], ['GET', '/api-keys'], ['POST', '/api-keys'],
      ['GET', '/branches'], ['GET', '/me'], ['POST', '/__test__/reset'], ['POST', '/__test__/transactions'], ['GET', '/reports/sales.csv'],
      ['POST', '/terminals'], ['GET', '/transactions/x/receipt'],
    ];
    for (const [method, url] of rutas) {
      const r = await h.app.inject({ method: method as 'GET' | 'POST', url: `${P}${url}`, headers: escritura, payload: method === 'POST' ? {} : undefined });
      expect(r.statusCode, `${method} ${url}`).toBe(404);
    }
  });
});

describe('K3 · alcances', () => {
  it('una llave read que cobra → 403 FORBIDDEN, incluso con cuerpo inválido, y no se crea nada', async () => {
    for (const cuerpo of [COBRO, {}, { ...COBRO, amount: '0' }]) {
      const r = await cobrar(cuerpo, IDEM(), lectura);
      expect(r.statusCode, JSON.stringify(cuerpo)).toBe(403);
      expect(sinCorrelacion(r)).toEqual({ error: { code: 'FORBIDDEN' } });
    }
    expect(filas()).toBe(0);
  });
  it('la llave write también lee', async () => {
    expect((await pub('/terminals', escritura)).statusCode).toBe(200);
    expect((await pub('/transactions', escritura)).statusCode).toBe(200);
  });
  it('una llave read sí lee todo lo de K4', async () => {
    for (const url of ['/terminals', '/transactions', '/reports/summary?from=1&to=2&tzOffsetMin=0']) {
      expect((await pub(url, lectura)).statusCode, url).toBe(200);
    }
  });
});

describe('K5 · transacciones con cursor', () => {
  // 25 transacciones con createdAt desordenado y con empates, para que el orden no coincida con el folio.
  const sembrar = async () => {
    const estados = ['approved', 'declined', 'approved', 'timeout', 'partially_refunded'] as const;
    const marcas = ['visa', 'mastercard', 'amex'] as const;
    for (let i = 0; i < 25; i++) {
      const estado = estados[i % 5]!;
      await inyectar({
        status: estado, brand: marcas[i % 3], method: i % 4 === 0 ? 'wallet' : 'card', terminalId: TERMINALES[i % 3],
        amount: String(100 + i * 37), refundedAmount: estado === 'partially_refunded' ? '10' : '0',
        createdAt: T0 + ((i * 7) % 11) * 60_000,
      });
    }
  };
  it('sin parámetros: 20 filas, nextCursor, mismo orden que el oráculo y misma forma que la lista interna', async () => {
    await sembrar();
    const r = await pub('/transactions');
    const b = r.json() as { items: Body[]; nextCursor: string | null };
    expect(Object.keys(b).sort()).toEqual(['items', 'nextCursor']);
    expect(b.items).toHaveLength(20);
    expect(typeof b.nextCursor).toBe('string');
    expect(b.items).toEqual((await oraculo()).slice(0, 20));
  });
  it('el recorrido completo no repite ni salta filas y calza con el oráculo (limit 7, 20, 25, 100)', async () => {
    await sembrar();
    const esperado = (await oraculo()).map((t) => t.folio);
    expect(new Set(esperado).size).toBe(25);
    for (const [limit, paginas] of [[7, 4], [20, 2], [25, 1], [100, 1], [1, 25]] as const) {
      const { folios, paginas: n } = await recorrer('', limit);
      expect(folios, `limit ${limit}`).toEqual(esperado);
      expect(n, `páginas con limit ${limit}`).toBe(paginas);
    }
  });
  it('la última página trae nextCursor null (también con limit igual al total)', async () => {
    await sembrar();
    const r = await pub('/transactions?limit=25');
    expect((r.json() as { nextCursor: unknown }).nextCursor).toBeNull();
    const vacio = await pub('/transactions?status=voided');
    expect(vacio.json()).toEqual({ items: [], nextCursor: null });
  });
  it('cobros nuevos entre páginas no mueven el resto del recorrido', async () => {
    await sembrar();
    const esperado = (await oraculo()).map((t) => t.folio);
    const p1 = (await pub('/transactions?limit=10')).json() as { items: Array<{ folio: number }>; nextCursor: string };
    for (let i = 0; i < 3; i++) await inyectar({ createdAt: T0 + 3_600_000 + i }); // más nuevos que todo
    const p2 = (await pub(`/transactions?limit=15&cursor=${p1.nextCursor}`)).json() as { items: Array<{ folio: number }>; nextCursor: string | null };
    expect([...p1.items, ...p2.items].map((i) => i.folio)).toEqual(esperado);
    expect(p2.nextCursor).toBeNull();
  });
  it('los filtros se combinan con Y y se mantienen al paginar', async () => {
    await sembrar();
    const filtros = [
      'status=approved', 'method=wallet', 'brand=amex', `terminalId=${TERMINALES[1]}`, 'status=declined&brand=mastercard',
      `from=${T0 + 120_000}&to=${T0 + 300_000}`, 'min=500&max=800', 'status=approved&method=card&min=300',
    ];
    for (const f of filtros) {
      const esperado = (await oraculo(`&${f}`)).map((t) => t.folio);
      const { folios } = await recorrer(`&${f}`, 3);
      expect(folios, f).toEqual(esperado);
    }
    expect((await oraculo('&status=approved')).length).toBeGreaterThan(0);
  });
  it('from/to/min/max son inclusivos', async () => {
    const a = await inyectar({ amount: '500', createdAt: T0 });
    const b = await inyectar({ amount: '900', createdAt: T0 + 1000 });
    await inyectar({ amount: '501', createdAt: T0 + 500 });
    const r = (await pub(`/transactions?from=${T0}&to=${T0 + 1000}&min=500&max=900`)).json() as { items: Array<{ id: string }> };
    expect(r.items.map((i) => i.id)).toContain(a.id);
    expect(r.items.map((i) => i.id)).toContain(b.id);
    expect(r.items).toHaveLength(3);
  });
  it('parámetros inválidos → 400 VALIDATION_ERROR', async () => {
    await sembrar();
    const malos = [
      'limit=0', 'limit=101', 'limit=x', 'limit=1.5', 'page=1', 'pageSize=5', 'cursor=!!!', 'cursor=', 'status=otro', 'zzz=1',
      `cursor=${Buffer.from('abc').toString('base64url')}`, `cursor=${Buffer.from('0').toString('base64url')}`, 'min=0', 'method=cash',
    ];
    for (const q of malos) {
      const r = await pub(`/transactions?${q}`);
      expect(r.statusCode, q).toBe(400);
      expect(sinCorrelacion(r), q).toEqual({ error: { code: 'VALIDATION_ERROR' } });
    }
  });
  it('un cursor bien formado sirve (codificarCursor del último folio visto)', async () => {
    await sembrar();
    const p1 = (await pub('/transactions?limit=5')).json() as { items: Array<{ folio: number }>; nextCursor: string };
    expect(p1.nextCursor).toBe(codificarCursor(p1.items[4]!.folio));
  });
});

describe('K6 · cobrar con Idempotency-Key', () => {
  it('aprobado, rechazado y timeout responden 201 con la transacción; cashierId = creador de la llave', async () => {
    const a = await cobrar(COBRO);
    expect(a.statusCode, a.body).toBe(201);
    expect(a.json()).toMatchObject({ folio: 1, status: 'approved', responseCode: '00', cashierId: 'user-admin', amount: '1500', refundedAmount: '0', method: 'card', brand: 'visa', last4: '1111', terminalId: 'term-demo-0001' });
    expect((a.json() as { authCode: string }).authCode).toMatch(/^[0-9]{6}$/);
    const d = await cobrar({ ...COBRO, last4: '0051' });
    expect(d.statusCode).toBe(201);
    expect(d.json()).toMatchObject({ folio: 2, status: 'declined', responseCode: '51', authCode: null });
    const t = await cobrar({ ...COBRO, last4: '0408' });
    expect(t.statusCode).toBe(201);
    expect(t.json()).toMatchObject({ folio: 3, status: 'timeout', responseCode: null, authCode: null });
    const interna = (await interno(`/transactions/${(a.json() as { id: string }).id}`)).json();
    expect(interna).toMatchObject({ folio: 1, status: 'approved', cashierId: 'user-admin' });
  });
  it('sin cabecera o con una que no es UUID → 400 y no se crea nada', async () => {
    for (const idem of [null, '', 'abc', '1234', `${IDEM()}x`]) {
      const r = await cobrar(COBRO, idem);
      expect(r.statusCode, String(idem)).toBe(400);
      expect(sinCorrelacion(r)).toEqual({ error: { code: 'VALIDATION_ERROR' } });
    }
    expect(filas()).toBe(0);
  });
  it('cuerpo inválido o con campos de más (requestId, status, cashierId, folio…) → 400 y no se crea nada', async () => {
    const malos = [
      {}, { ...COBRO, requestId: IDEM() }, { ...COBRO, status: 'approved' }, { ...COBRO, cashierId: 'user-cajero' }, { ...COBRO, folio: 9 },
      { ...COBRO, amount: '0' }, { ...COBRO, amount: '100000000' }, { ...COBRO, amount: 1500 }, { ...COBRO, method: 'cash' }, { ...COBRO, brand: 'diners' }, { ...COBRO, last4: '12' },
    ];
    for (const cuerpo of malos) expect((await cobrar(cuerpo)).statusCode, JSON.stringify(cuerpo)).toBe(400);
    expect(filas()).toBe(0);
  });
  it('misma clave y mismo cuerpo → 200 con la misma transacción, sin segundo folio', async () => {
    const clave = IDEM();
    const a = await cobrar(COBRO, clave);
    const b = await cobrar(COBRO, clave);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    expect(filas()).toBe(1);
    const c = await cobrar(COBRO);
    expect((c.json() as { folio: number }).folio).toBe(2);
  });
  it('misma clave con otro cuerpo → 409 CONFLICT y no cambia nada', async () => {
    const clave = IDEM();
    const a = await cobrar(COBRO, clave);
    for (const otro of [{ ...COBRO, amount: '1501' }, { ...COBRO, last4: '2222' }, { ...COBRO, terminalId: 'term-demo-0002' }, { ...COBRO, brand: 'amex' }]) {
      const r = await cobrar(otro, clave);
      expect(r.statusCode, JSON.stringify(otro)).toBe(409);
      expect(sinCorrelacion(r)).toEqual({ error: { code: 'CONFLICT' } });
    }
    expect(filas()).toBe(1);
    expect((await pub(`/transactions/${(a.json() as { id: string }).id}`)).json()).toMatchObject({ amount: '1500', last4: '1111' });
  });
  it('cinco peticiones simultáneas con la misma clave crean UNA transacción (una 201, el resto 200)', async () => {
    const clave = IDEM();
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => cobrar(COBRO, clave)));
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(rs.map((r) => (r.json() as { id: string }).id)).size).toBe(1);
    expect(filas()).toBe(1);
  });
  it('terminal desconocido → 404; inactivo → 409; de otro comercio → 404; no se crea nada', async () => {
    await comercioAjeno(h);
    expect((await cobrar({ ...COBRO, terminalId: 'nada' })).statusCode).toBe(404);
    expect((await cobrar({ ...COBRO, terminalId: 't-ajeno' })).statusCode).toBe(404);
    const inactivo = await cobrar({ ...COBRO, terminalId: 'term-demo-0003' });
    expect(inactivo.statusCode).toBe(409);
    expect(sinCorrelacion(inactivo)).toEqual({ error: { code: 'CONFLICT' } });
    expect(filas()).toBe(1 /* la transacción ajena sembrada */);
  });
  it('el importe máximo pasa exacto (sin number)', async () => {
    const r = await cobrar({ ...COBRO, amount: '99999999' });
    expect(r.statusCode).toBe(201);
    expect((r.json() as { amount: string }).amount).toBe('99999999');
  });
});

describe('K7 · límite de tasa por llave', () => {
  it('el 61.º pedido en un minuto da 429 RATE_LIMITED con Retry-After (defecto 60)', async () => {
    for (let i = 0; i < 60; i++) expect((await pub('/terminals/term-demo-0001')).statusCode, `pedido ${i + 1}`).toBe(200);
    const r = await pub('/terminals/term-demo-0001');
    expect(r.statusCode).toBe(429);
    expect(sinCorrelacion(r)).toEqual({ error: { code: 'RATE_LIMITED' } });
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('publicRateMax lo cambia, es por llave y no afecta a /api/v1', async () => {
    const g = await makeApp({ enableTestRoutes: true, publicRateMax: 3 });
    const adm = withCookie(await loginToken(g, 'admin'));
    const a = bearer((await crearLlave(g, adm, 'read', 'a')).key);
    const b = bearer((await crearLlave(g, adm, 'read', 'b')).key);
    const ir = (headers: Record<string, string>) => g.app.inject({ method: 'GET', url: `${P}/terminals`, headers });
    for (let i = 0; i < 3; i++) expect((await ir(a)).statusCode).toBe(200);
    const bloqueada = await ir(a);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body).not.toContain(a.authorization!.slice(7));
    expect((await ir(b)).statusCode).toBe(200);
    for (let i = 0; i < 6; i++) expect((await g.app.inject({ method: 'GET', url: '/api/v1/terminals', headers: adm })).statusCode).toBe(200);
  });
});
