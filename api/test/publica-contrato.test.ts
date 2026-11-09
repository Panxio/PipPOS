import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import { z } from 'zod';
import { CreateTransactionPublicSchema } from '@pippos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, IDEM, bearer, comercioAjeno, crearLlave, loginToken, makeApp, sinCorrelacion, withCookie } from './helpers/app';

const P = '/public/v1';
const T0 = 1_700_000_000_000;
const COBRO = { terminalId: 'term-demo-0001', amount: '1500', method: 'card', brand: 'visa', last4: '1111' };
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

let h: Harness;
let admin: Record<string, string>;
let clave: string;
let lectura: Record<string, string>;
let escritura: Record<string, string>;

beforeEach(async () => {
  h = await makeApp({ enableTestRoutes: true });
  admin = withCookie(await loginToken(h, 'admin'));
  clave = (await crearLlave(h, admin, 'read', 'lectura')).key;
  lectura = bearer(clave);
  escritura = bearer((await crearLlave(h, admin, 'write', 'escritura')).key);
});

type Json = Record<string, any>;
const pub = (url: string, headers = lectura) => h.app.inject({ method: 'GET', url: `${P}${url}`, headers });
const inyectar = (over: Json = {}) =>
  h.app.inject({
    method: 'POST', url: '/__test__/transactions',
    payload: { terminalId: 'term-demo-0001', cashierId: 'user-cajero', amount: '1000', method: 'card', brand: 'visa', last4: '4242', status: 'approved', createdAt: T0, ...over },
  });

describe('K8 · openapi.json', () => {
  const abrir = async (): Promise<Json> => {
    const r = await h.app.inject({ method: 'GET', url: `${P}/openapi.json` });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    return r.json();
  };
  const resolver = (doc: Json, nodo: Json): Json => {
    let actual = nodo;
    for (let i = 0; i < 5 && typeof actual.$ref === 'string'; i++) {
      actual = actual.$ref.replace(/^#\//, '').split('/').reduce((n: Json, k: string) => n[k], doc);
    }
    return actual;
  };
  const sinMeta = (s: Json): Json => { const { $schema: _omitido, ...resto } = s; return resto; };

  it('es público (sin llave) y 3.1', async () => {
    const doc = await abrir();
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(typeof doc.info.title).toBe('string');
    expect(doc.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
  it('lista exactamente las rutas y métodos de K4-K6, con rutas completas', async () => {
    const doc = await abrir();
    const rutas = Object.fromEntries(Object.entries(doc.paths as Json).map(([p, ops]) => [p, Object.keys(ops as Json).sort()]));
    expect(rutas).toEqual({
      '/public/v1/terminals': ['get'], '/public/v1/terminals/{id}': ['get'],
      '/public/v1/reports/summary': ['get'], '/public/v1/reports/sales': ['get'],
      '/public/v1/transactions': ['get', 'post'], '/public/v1/transactions/{id}': ['get'],
    });
  });
  it('cada operación exige el esquema bearer', async () => {
    const doc = await abrir();
    for (const [p, ops] of Object.entries(doc.paths as Json)) {
      for (const [m, op] of Object.entries(ops as Json)) expect((op as Json).security, `${m} ${p}`).toEqual([{ bearer: [] }]);
    }
  });
  it('GET /transactions documenta sus filtros, limit y cursor', async () => {
    const doc = await abrir();
    const params = (doc.paths['/public/v1/transactions'].get.parameters as Json[]).map((x) => resolver(doc, x).name).sort();
    expect(params).toEqual(['brand', 'cursor', 'from', 'limit', 'max', 'method', 'min', 'status', 'terminalId', 'to']);
  });
  it('POST /transactions: cabecera Idempotency-Key requerida y cuerpo = JSON Schema de CreateTransactionPublicSchema', async () => {
    const doc = await abrir();
    const post = doc.paths['/public/v1/transactions'].post as Json;
    const idem = (post.parameters as Json[]).map((x) => resolver(doc, x)).find((x) => x.name === 'Idempotency-Key');
    expect(idem).toMatchObject({ in: 'header', required: true });
    const cuerpo = sinMeta(resolver(doc, post.requestBody.content['application/json'].schema));
    const esperados = [sinMeta(z.toJSONSchema(CreateTransactionPublicSchema)), sinMeta(z.toJSONSchema(CreateTransactionPublicSchema, { io: 'input' }))];
    expect(esperados).toContainEqual(cuerpo);
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    const valida = ajv.compile({ ...cuerpo, components: doc.components });
    expect(valida(COBRO)).toBe(true);
    expect(valida({ ...COBRO, requestId: IDEM() })).toBe(false);
    expect(valida({ ...COBRO, amount: '0' })).toBe(false);
  });
  it('una respuesta real de cada ruta valida contra su esquema', async () => {
    const tx = (await inyectar({ amount: '2500' })).json() as Json;
    const doc = await abrir();
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    const rango = `from=${T0 - 86_400_000}&to=${T0 + 86_400_000}&tzOffsetMin=0`;
    const casos: Array<[string, string, string, () => Promise<{ statusCode: number; json: () => unknown }>]> = [
      ['/public/v1/terminals', 'get', '200', () => pub('/terminals')],
      ['/public/v1/terminals/{id}', 'get', '200', () => pub('/terminals/term-demo-0001')],
      ['/public/v1/reports/summary', 'get', '200', () => pub(`/reports/summary?${rango}&compare=true`)],
      ['/public/v1/reports/sales', 'get', '200', () => pub(`/reports/sales?${rango}&groupBy=terminal`)],
      ['/public/v1/transactions', 'get', '200', () => pub('/transactions')],
      ['/public/v1/transactions/{id}', 'get', '200', () => pub(`/transactions/${tx.id}`)],
    ];
    const clavePost = IDEM();
    const post = () => h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...escritura, 'idempotency-key': clavePost }, payload: COBRO });
    casos.push(['/public/v1/transactions', 'post', '201', post], ['/public/v1/transactions', 'post', '200', post]);
    for (const [ruta, metodo, codigo, pedir] of casos) {
      const respuesta = await pedir();
      expect(respuesta.statusCode, `${metodo} ${ruta}`).toBe(Number(codigo));
      const declarado = doc.paths[ruta][metodo].responses[codigo];
      expect(declarado, `${metodo} ${ruta} ${codigo} declarado`).toBeDefined();
      const esquema = resolver(doc, resolver(doc, declarado).content['application/json'].schema);
      const valida = ajv.compile({ ...esquema, components: doc.components });
      expect(valida(respuesta.json()), `${metodo} ${ruta} ${codigo}: ${JSON.stringify(valida.errors)}`).toBe(true);
    }
  });
});

describe('K9 · seguridad', () => {
  it('BOLA: cada llave ve solo su comercio (listas, ids, terminales, ventas)', async () => {
    const ajeno = await comercioAjeno(h);
    const miTx = (await inyectar()).json() as Json;
    const llaveB = await crearLlave(h, ajeno, 'write', 'de B');
    const b = bearer(llaveB.key);
    const rango = `from=${T0 - 86_400_000}&to=${T0 + 86_400_000}&tzOffsetMin=0&groupBy=terminal`;
    const conVentas = async (headers: Record<string, string>) =>
      ((await pub(`/reports/sales?${rango}`, headers)).json() as Json).items.filter((i: Json) => i.sales > 0).map((i: Json) => i.key);

    expect(((await pub('/transactions', b)).json() as Json).items.map((i: Json) => i.id)).toEqual(['tx-ajena']);
    expect(((await pub('/transactions', lectura)).json() as Json).items.map((i: Json) => i.id)).toEqual([miTx.id]);
    expect((await pub('/transactions/tx-ajena', lectura)).statusCode).toBe(404);
    expect((await pub(`/transactions/${miTx.id}`, b)).statusCode).toBe(404);
    expect((await pub('/terminals/t-ajeno', lectura)).statusCode).toBe(404);
    expect((await pub('/terminals/term-demo-0001', b)).statusCode).toBe(404);
    expect(((await pub('/terminals', b)).json() as Json).items.map((i: Json) => i.id)).toEqual(['t-ajeno']);
    expect(((await pub('/terminals', lectura)).json() as Json).items.map((i: Json) => i.id)).not.toContain('t-ajeno');
    expect(await conVentas(b)).toEqual(['t-ajeno']);
    expect(await conVentas(lectura)).toEqual(['term-demo-0001']);

    const antes = (h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n;
    const robo = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...b, 'idempotency-key': IDEM() }, payload: COBRO });
    expect(robo.statusCode).toBe(404);
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n).toBe(antes);
    const propio = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...b, 'idempotency-key': IDEM() }, payload: { ...COBRO, terminalId: 't-ajeno' } });
    expect(propio.statusCode).toBe(201);
    expect(h.db.prepare("SELECT merchant_id, cashier_id FROM transactions WHERE id = ?").get((propio.json() as Json).id)).toMatchObject({ merchant_id: 'm-ajeno', cashier_id: 'u-ajeno' });
  });
  it('el mismo Idempotency-Key en dos comercios no se cruza', async () => {
    const ajeno = await comercioAjeno(h);
    const b = bearer((await crearLlave(h, ajeno, 'write', 'de B')).key);
    const clave2 = IDEM();
    const a = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...escritura, 'idempotency-key': clave2 }, payload: COBRO });
    const c = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...b, 'idempotency-key': clave2 }, payload: { ...COBRO, terminalId: 't-ajeno' } });
    expect(a.statusCode).toBe(201);
    expect(c.statusCode).toBe(201);
    expect((a.json() as Json).id).not.toBe((c.json() as Json).id);
  });
  it('el hash guardado no sirve como credencial', async () => {
    for (const intento of [sha256(clave), `pip_${sha256(clave)}`]) {
      expect((await pub('/terminals', bearer(intento))).statusCode).toBe(401);
    }
  });
  it('inyección en filtros y cursor: nunca 500 ni filas de más', async () => {
    await inyectar();
    const r = await pub(`/transactions?terminalId=${encodeURIComponent("x' OR '1'='1")}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ items: [], nextCursor: null });
    expect((await pub(`/transactions?cursor=${encodeURIComponent("1 OR 1=1")}`)).statusCode).toBe(400);
    expect((await pub(`/terminals/${encodeURIComponent("x' OR '1'='1")}`)).statusCode).toBe(404);
  });
  it('ninguna respuesta de error contiene la llave', async () => {
    const mal = await h.app.inject({ method: 'GET', url: `${P}/terminals`, headers: bearer(`${clave}x`) });
    const sinAlcance = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...lectura, 'idempotency-key': IDEM() }, payload: COBRO });
    const invalida = await pub('/transactions?limit=0');
    for (const r of [mal, sinAlcance, invalida]) {
      expect(JSON.stringify(r.body) + JSON.stringify(r.headers)).not.toContain(clave);
      expect(Object.keys((r.json() as Json).error).sort()).toEqual(['code', 'correlationId']);
    }
    expect(sinCorrelacion(mal)).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });
  it('una llave revocada deja de valer también para cobrar', async () => {
    const llaves = (await h.app.inject({ method: 'GET', url: '/api/v1/api-keys', headers: admin })).json() as Json;
    const w = llaves.items.find((i: Json) => i.name === 'escritura');
    expect((await h.app.inject({ method: 'POST', url: `/api/v1/api-keys/${w.id}/revoke`, headers: admin })).statusCode).toBe(200);
    const r = await h.app.inject({ method: 'POST', url: `${P}/transactions`, headers: { ...escritura, 'idempotency-key': IDEM() }, payload: COBRO });
    expect(r.statusCode).toBe(401);
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n).toBe(0);
  });
});
