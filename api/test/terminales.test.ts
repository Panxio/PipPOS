import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, loginToken, makeApp, withCookie } from './helpers/app';

const BASE = '/api/v1/terminals';
const CLAVES = ['alias', 'batteryPct', 'branch', 'connection', 'createdAt', 'firmware', 'id', 'model', 'serial', 'status', 'till'];
const NUEVA = { serial: 'TERM-0100', alias: 'Barra', model: 'PAX A920', branch: 'Centro', till: 'Caja 1' };

let h: Harness;
let admin: Record<string, string>;
let supervisor: Record<string, string>;
let cajero: Record<string, string>;

beforeEach(async () => {
  h = await makeApp();
  admin = withCookie(await loginToken(h, 'admin'));
  supervisor = withCookie(await loginToken(h, 'supervisor'));
  cajero = withCookie(await loginToken(h, 'cajero'));
});

const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const post = (payload: unknown, headers = admin) => h.app.inject({ method: 'POST', url: BASE, headers, payload: payload as object });
const patch = (id: string, payload: unknown, headers = admin) =>
  h.app.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers, payload: payload as object });
const importar = (csv: string, headers = admin) =>
  h.app.inject({ method: 'POST', url: `${BASE}/import`, headers: { ...headers, 'content-type': 'text/csv' }, payload: csv });
const lista = async (qs = '') => (await get(`${BASE}${qs}`)).json();
const idDe = async (serial: string): Promise<string> =>
  (await lista('?pageSize=100')).items.find((t: { serial: string }) => t.serial === serial).id;

describe('S1 permisos', () => {
  it('sin sesión: 401 en lectura y escritura', async () => {
    expect((await get(BASE, {})).statusCode).toBe(401);
    expect((await post(NUEVA, {})).statusCode).toBe(401);
  });
  it('cajero (R3, F20): lee la lista y el detalle, pero 403 FORBIDDEN al escribir', async () => {
    const id = await idDe('TERM-0001');
    expect((await get(BASE, cajero)).statusCode).toBe(200);
    expect((await get(`${BASE}/${id}`, cajero)).statusCode).toBe(200);
    for (const res of [await post(NUEVA, cajero),
      await patch(id, { alias: 'x' }, cajero), await importar('serial,alias,model,branch,till\n', cajero)]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
  });
  it('supervisor: lee, pero no escribe (y no se crea nada)', async () => {
    const id = await idDe('TERM-0001');
    expect((await get(BASE, supervisor)).statusCode).toBe(200);
    expect((await get(`${BASE}/${id}`, supervisor)).statusCode).toBe(200);
    for (const res of [await post(NUEVA, supervisor), await patch(id, { alias: 'x' }, supervisor),
      await importar(`serial,alias,model,branch,till\nTERM-0200,a,b,c,d\n`, supervisor)]) expect(res.statusCode).toBe(403);
    expect((await lista()).total).toBe(3);
  });
  it('petición con efecto y Origin ajeno: 403 ORIGIN_NOT_ALLOWED', async () => {
    const res = await h.app.inject({ method: 'POST', url: BASE, headers: { ...admin, origin: 'http://evil.test' }, payload: NUEVA });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});

describe('S2 lista, filtros, orden y paginación', () => {
  it('semilla S7: 3 terminales, orden serial asc, forma exacta', async () => {
    const r = await get(BASE);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect([b.total, b.page, b.pageSize]).toEqual([3, 1, 20]);
    expect(b.items.map((t: { serial: string }) => t.serial)).toEqual(['TERM-0001', 'TERM-0002', 'TERM-0003']);
    expect(Object.keys(b.items[0]).sort()).toEqual(CLAVES);
    expect(b.items[0]).toMatchObject({ status: 'active', connection: 'online', batteryPct: 87, firmware: '1.4.2' });
    expect(b.items[2]).toMatchObject({ status: 'inactive', connection: 'offline', batteryPct: 55, firmware: '1.3.9' });
  });
  it('filtra por estado y busca por subcadena sin distinguir mayúsculas', async () => {
    expect((await lista('?status=inactive')).items.map((t: { serial: string }) => t.serial)).toEqual(['TERM-0003']);
    expect((await lista('?status=active')).total).toBe(2);
    expect((await lista('?q=term-0002')).total).toBe(1);
    const id = await idDe('TERM-0001');
    await patch(id, { alias: 'Barra Principal' });
    expect((await lista('?q=PRINCIPAL')).items.map((t: { serial: string }) => t.serial)).toEqual(['TERM-0001']);
    expect((await lista('?q=nada-que-coincida')).total).toBe(0);
  });
  it('ordena por alias y por serial descendente', async () => {
    await patch(await idDe('TERM-0001'), { alias: 'Zeta' });
    await patch(await idDe('TERM-0002'), { alias: 'Alfa' });
    await patch(await idDe('TERM-0003'), { alias: 'Medio' });
    expect((await lista('?sort=alias&order=asc')).items.map((t: { alias: string }) => t.alias)).toEqual(['Alfa', 'Medio', 'Zeta']);
    expect((await lista('?sort=serial&order=desc')).items.map((t: { serial: string }) => t.serial)).toEqual(['TERM-0003', 'TERM-0002', 'TERM-0001']);
    expect((await lista('?sort=createdAt&order=asc')).total).toBe(3);
    expect((await lista('?sort=branch')).total).toBe(3);
  });
  it('pagina: total no depende de la página; fuera de rango da lista vacía', async () => {
    const p2 = await lista('?page=2&pageSize=2');
    expect([p2.items.length, p2.total, p2.page, p2.pageSize]).toEqual([1, 3, 2, 2]);
    expect((await lista('?page=9&pageSize=2')).items).toEqual([]);
    expect((await lista('?pageSize=100')).pageSize).toBe(100);
  });
  it('parámetros inválidos: 400 VALIDATION_ERROR', async () => {
    for (const qs of ['?sort=passwordHash', '?order=up', '?status=otro', '?page=0', '?page=x', '?pageSize=101', '?pageSize=0', '?q=' + 'a'.repeat(61)]) {
      const r = await get(`${BASE}${qs}`);
      expect(r.statusCode, qs).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('S3 alta', () => {
  it('crea con valores por defecto, normaliza el serial y aparece en la lista', async () => {
    const r = await post({ ...NUEVA, serial: '  term-0100 ', alias: ' Barra ' });
    expect(r.statusCode).toBe(201);
    const t = r.json();
    expect(Object.keys(t).sort()).toEqual(CLAVES);
    expect(t).toMatchObject({ serial: 'TERM-0100', alias: 'Barra', status: 'active', connection: 'offline', batteryPct: 100, firmware: '1.4.2' });
    expect((await lista()).total).toBe(4);
    expect((await get(`${BASE}/${t.id}`)).json()).toEqual(t);
  });
  it('serial repetido (también con otras mayúsculas): 409 CONFLICT y nada nuevo', async () => {
    for (const serial of ['TERM-0001', 'term-0001']) {
      const r = await post({ ...NUEVA, serial });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CONFLICT');
    }
    expect((await lista()).total).toBe(3);
  });
  it('validación: serial corto/largo/con símbolos, campos vacíos o largos, tipos malos → 400', async () => {
    const malos = [{ serial: 'AB-1' }, { serial: 'A'.repeat(21) }, { serial: 'TERM 0100' }, { serial: 'TERM_0100' }, { alias: '   ' },
      { alias: 'a'.repeat(61) }, { model: '' }, { branch: 'b'.repeat(61) }, { till: 5 }, { serial: null }];
    for (const m of malos) {
      const r = await post({ ...NUEVA, ...m });
      expect(r.statusCode, JSON.stringify(m)).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
    const { till: _omitido, ...sinTill } = NUEVA;
    expect((await post(sinTill)).statusCode).toBe(400);
    expect((await lista()).total).toBe(3);
  });
  it('mass assignment: campos extra → 400 y no se heredan', async () => {
    for (const extra of [{ status: 'inactive' }, { merchantId: 'otro' }, { id: 'mio' }, { batteryPct: 5 }]) {
      expect((await post({ ...NUEVA, ...extra })).statusCode).toBe(400);
    }
    expect((await lista()).total).toBe(3);
  });
});

describe('S4 detalle y aislamiento por comercio', () => {
  it('detalle de la semilla y 404 para id inexistente', async () => {
    const id = await idDe('TERM-0002');
    const r = await get(`${BASE}/${id}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ serial: 'TERM-0002', connection: 'offline', batteryPct: 12 });
    const nf = await get(`${BASE}/no-existe`);
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('NOT_FOUND');
  });
  it('un terminal de OTRO comercio: no aparece en la lista, 404 al leerlo y al editarlo, y el serial es libre', async () => {
    h.db.prepare('INSERT INTO merchants (id, name) VALUES (?, ?)').run('m-otro', 'Otro Comercio');
    h.db.prepare(
      `INSERT INTO terminals (id, merchant_id, serial, alias, model, branch, till, status, firmware, battery_pct, connection, created_at_ms)
       VALUES ('t-ajeno','m-otro','AJENO-0001','x','x','x','x','active','1.4.2',50,'online',1)`,
    ).run();
    expect((await lista()).total).toBe(3);
    expect((await lista('?q=AJENO')).total).toBe(0);
    expect((await get(`${BASE}/t-ajeno`)).statusCode).toBe(404);
    expect((await patch('t-ajeno', { alias: 'robado' })).statusCode).toBe(404);
    expect((await post({ ...NUEVA, serial: 'AJENO-0001' })).statusCode).toBe(201);
    expect(h.db.prepare("SELECT alias FROM terminals WHERE id = 't-ajeno'").get()).toEqual({ alias: 'x' });
  });
});

describe('S5 edición y activar/desactivar', () => {
  it('cambia alias, sucursal, caja y estado; el resto queda igual', async () => {
    const id = await idDe('TERM-0001');
    const antes = (await get(`${BASE}/${id}`)).json();
    const r = await patch(id, { alias: ' Nuevo ', branch: 'Sur', till: 'Caja 9', status: 'inactive' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ...antes, alias: 'Nuevo', branch: 'Sur', till: 'Caja 9', status: 'inactive' });
    expect((await lista('?status=inactive')).total).toBe(2);
    expect((await patch(id, { status: 'active' })).json().status).toBe('active');
  });
  it('inválidos → 400: vacío, serial/id/campos ajenos, estado raro, valores largos; 404 si no existe', async () => {
    const id = await idDe('TERM-0001');
    for (const body of [{}, { serial: 'OTRO-0001' }, { id: 'x' }, { batteryPct: 1 }, { status: 'borrado' }, { alias: '' }, { branch: 'b'.repeat(61) }]) {
      const r = await patch(id, body);
      expect(r.statusCode, JSON.stringify(body)).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect((await patch('no-existe', { alias: 'x' })).statusCode).toBe(404);
    expect((await get(`${BASE}/${id}`)).json().serial).toBe('TERM-0001');
  });
});

describe('S6 importación CSV', () => {
  const CAB = 'serial,alias,model,branch,till';

  it('crea las válidas y reporta las inválidas con su número de línea (cabecera = 1)', async () => {
    const csv = [CAB, 'TERM-0201,Caja A,PAX A920,Centro,Caja 1', 'ab,Mala,PAX,Centro,Caja 2', 'term-0001,Repe,PAX,Centro,Caja 3',
      'TERM-0202,Caja B,PAX A920,Norte,Caja 4', 'TERM-0202,Otra,PAX,Norte,Caja 5', 'TERM-0203,,PAX,Norte,Caja 6',
      `TERM-0204,${'a'.repeat(61)},PAX,Norte,Caja 7`, 'TERM-0205,=CMD(),PAX,Norte,Caja 8', 'TERM-0206,ok,PAX,@x,Caja 9'].join('\n');
    const r = await importar(csv);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      created: 2,
      invalid: [{ row: 3, code: 'INVALID_SERIAL' }, { row: 4, code: 'DUPLICATE_SERIAL' }, { row: 6, code: 'DUPLICATE_SERIAL' },
        { row: 7, code: 'MISSING_FIELD' }, { row: 8, code: 'INVALID_FIELD' }, { row: 9, code: 'UNSAFE_VALUE' }, { row: 10, code: 'UNSAFE_VALUE' }],
    });
    expect((await lista('?pageSize=100')).items.map((t: { serial: string }) => t.serial)).toEqual(
      ['TERM-0001', 'TERM-0002', 'TERM-0003', 'TERM-0201', 'TERM-0202']);
  });
  it('soporta CRLF, comillas y comas dentro de comillas; el valor se guarda sin las comillas', async () => {
    const r = await importar(`${CAB}\r\nTERM-0300,"Caja, norte","PAX ""A920""",Centro,Caja 1\r\n`);
    expect(r.json()).toEqual({ created: 1, invalid: [] });
    const t = (await lista('?q=TERM-0300')).items[0];
    expect(t).toMatchObject({ alias: 'Caja, norte', model: 'PAX "A920"', status: 'active' });
  });
  it('cabecera distinta, cuerpo vacío o más de 500 filas: 400 y no se crea nada', async () => {
    const filas = (n: number) => Array.from({ length: n }, (_, i) => `IMP-${String(i).padStart(5, '0')},a,m,b,c`);
    for (const csv of ['', `${CAB},extra\nTERM-0400,a,b,c,d,e`, 'serial,alias\nTERM-0400,a', 'SERIAL,ALIAS,MODEL,BRANCH,TILL\nTERM-0400,a,b,c,d',
      [CAB, ...filas(501)].join('\n')]) {
      const r = await importar(csv);
      expect(r.statusCode, csv.slice(0, 30)).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect((await lista()).total).toBe(3);
  });
  it('500 filas exactas se aceptan', async () => {
    const filas = Array.from({ length: 500 }, (_, i) => `IMP-${String(i).padStart(5, '0')},a,m,b,c`);
    const r = await importar([CAB, ...filas].join('\n'));
    expect(r.json()).toEqual({ created: 500, invalid: [] });
    expect((await lista()).total).toBe(503);
  });
  it('solo cabecera: 200 con 0 creadas; importar dos veces el mismo archivo no duplica', async () => {
    expect((await importar(`${CAB}\n`)).json()).toEqual({ created: 0, invalid: [] });
    const csv = `${CAB}\nTERM-0500,a,m,b,c`;
    expect((await importar(csv)).json().created).toBe(1);
    expect((await importar(csv)).json()).toEqual({ created: 0, invalid: [{ row: 2, code: 'DUPLICATE_SERIAL' }] });
  });
});

describe('S7 semilla y reseteo', () => {
  it('/__test__/reset restaura las 3 terminales de la semilla', async () => {
    const t = await makeApp({ enableTestRoutes: true });
    const cookie = withCookie(await loginToken(t, 'admin'));
    await t.app.inject({ method: 'POST', url: BASE, headers: cookie, payload: NUEVA });
    await t.app.inject({ method: 'POST', url: '/__test__/reset' });
    const c2 = withCookie(await loginToken(t, 'admin'));
    const r = await t.app.inject({ method: 'GET', url: BASE, headers: c2 });
    expect(r.json().total).toBe(3);
  });
});
