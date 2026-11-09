import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, type Harness, bearer, comercioAjeno, crearLlave, login, loginToken, makeApp, tokenOf, withCookie } from './helpers/app';

const BASE = '/api/v1/audit';
const MERCHANT = 'merchant-boliche-la-noche';
const T0 = 1_700_000_000_000;
const CLAVES = ['action', 'actorId', 'actorName', 'atMs', 'detail', 'entityId', 'entityType', 'seq'];
const CABECERA = 'seq,atMs,actorId,actorName,action,entityType,entityId,detail';
const CLAVE_NUEVA = 'clave-nueva-2026';

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

type Entrada = {
  seq: number; atMs: number; actorId: string | null; actorName: string; action: string;
  entityType: string; entityId: string | null; detail: Record<string, string>;
};
type Pagina = { items: Entrada[]; total: number; page: number; pageSize: number };
type Body = Record<string, unknown>;
const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const post = (url: string, headers = admin, payload?: unknown) => h.app.inject({ method: 'POST', url, headers, payload: payload as object | undefined });
const patch = (url: string, payload: unknown, headers = admin) => h.app.inject({ method: 'PATCH', url, headers, payload: payload as object });
const pagina = async (qs = '', headers = admin): Promise<Pagina> => {
  const r = await get(`${BASE}${qs}`, headers);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const todo = async (qs = ''): Promise<Entrada[]> => (await pagina(`?pageSize=100${qs}`)).items;
const delTipo = async (action: string) => (await todo(`&action=${action}`));
const ultima = async (action: string): Promise<Entrada> => {
  const l = await delTipo(action);
  expect(l.length, `no hay entradas ${action}`).toBeGreaterThan(0);
  return l[0]!;
};
const total = async () => (await pagina('?pageSize=1')).total;
const nombreDe = (id: string) => (h.db.prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string }).name;
const cobrar = async (amount = '12500') => {
  const r = await post('/api/v1/transactions', admin, { requestId: crypto.randomUUID(), terminalId: 'term-demo-0001', amount, method: 'card', brand: 'visa', last4: '4242' });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; folio: number };
};
const crearTerminal = async (serial = 'TERM-0900') => {
  const r = await post('/api/v1/terminals', admin, { serial, alias: 'Nueva', model: 'PAX A920', branch: 'Centro', till: 'Caja 1' });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string };
};
const filasDeBitacora = () => h.db.prepare('SELECT * FROM audit_log').all() as Array<Record<string, unknown>>;

// Lector CSV mínimo (RFC 4180) para comparar el archivo con la lista: oráculo independiente del código que lo escribe.
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entre = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (entre) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') entre = false; else celda += c;
    } else if (c === '"') entre = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\r' && texto[i + 1] === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; i++; }
    else celda += c;
  }
  expect(celda === '' && fila.length === 0, 'el CSV debe terminar en \\r\\n').toBe(true);
  return filas;
}
const celdasDe = (e: Entrada): string[] =>
  [String(e.seq), String(e.atMs), e.actorId ?? '', e.actorName, e.action, e.entityType, e.entityId ?? '', JSON.stringify(e.detail)];
// Lo que debe salir en una celda de texto: con apóstrofe si empieza con una fórmula.
const seguro = (t: string) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);

describe('A7 · qué se registra', () => {
  it('auth.login: una entrada por inicio de sesión, con el usuario como actor y como entidad', async () => {
    const l = await delTipo('auth.login');
    expect(l.map((e) => e.actorId).sort()).toEqual(['user-admin', 'user-cajero', 'user-supervisor']);
    const e = l.find((x) => x.actorId === 'user-admin')!;
    expect(Object.keys(e).sort()).toEqual(CLAVES);
    expect(e).toMatchObject({ actorName: nombreDe('user-admin'), atMs: T0, entityType: 'user', entityId: 'user-admin' });
    expect(e.detail).toEqual({});
    expect(Number.isInteger(e.seq)).toBe(true);
  });
  it('auth.login_failed: solo si el correo existe; sin la contraseña; el correo desconocido no deja huella', async () => {
    const antes = await total();
    expect((await login(h, 'nadie@pippos.test', 'x')).statusCode).toBe(401);
    expect(await total()).toBe(antes);
    expect((await login(h, 'admin@pippos.test', 'clave-incorrecta-xyz')).statusCode).toBe(401);
    const e = await ultima('auth.login_failed');
    expect(e).toMatchObject({ actorId: 'user-admin', actorName: nombreDe('user-admin'), entityType: 'user', entityId: 'user-admin' });
    expect(e.detail).toEqual({});
    expect(JSON.stringify(filasDeBitacora())).not.toContain('clave-incorrecta-xyz');
    expect(await total()).toBe(antes + 1);
  });
  it('user.created y user.updated', async () => {
    const r = await post('/api/v1/users', admin, { name: 'Pedro Soto', email: 'pedro@pippos.test', role: 'cajero', branchId: 'branch-centro' });
    expect(r.statusCode, r.body).toBe(201);
    const id = (r.json() as { id: string }).id;
    expect(await ultima('user.created')).toMatchObject({ actorId: 'user-admin', entityType: 'user', entityId: id, detail: { role: 'cajero' } });
    expect((await patch(`/api/v1/users/${id}`, { role: 'supervisor' })).statusCode).toBe(200);
    expect(await ultima('user.updated')).toMatchObject({ actorId: 'user-admin', entityType: 'user', entityId: id, detail: { role: 'supervisor' } });
    expect((await patch(`/api/v1/users/${id}`, { status: 'inactive' })).statusCode).toBe(200);
    expect((await ultima('user.updated')).detail).toMatchObject({ status: 'inactive' });
  });
  it('user.password_changed: sin ninguna de las dos contraseñas en la bitácora', async () => {
    expect((await post('/api/v1/me/password', admin, { current: DEMO_PASSWORD, next: CLAVE_NUEVA })).statusCode).toBe(204);
    admin = withCookie(tokenOf(await login(h, 'admin@pippos.test', CLAVE_NUEVA))); // cambiar la clave cierra todas las sesiones
    expect(await ultima('user.password_changed')).toMatchObject({ actorId: 'user-admin', entityType: 'user', entityId: 'user-admin', detail: {} });
    const volcado = JSON.stringify(filasDeBitacora());
    expect(volcado).not.toContain(DEMO_PASSWORD);
    expect(volcado).not.toContain(CLAVE_NUEVA);
    expect(volcado).not.toContain('h:');
  });
  it('terminal.created, terminal.updated y terminal.imported', async () => {
    const { id } = await crearTerminal();
    expect(await ultima('terminal.created')).toMatchObject({ actorId: 'user-admin', entityType: 'terminal', entityId: id });
    expect((await patch(`/api/v1/terminals/${id}`, { alias: 'Otra', status: 'inactive' })).statusCode).toBe(200);
    expect(await ultima('terminal.updated')).toMatchObject({ entityType: 'terminal', entityId: id, detail: { alias: 'Otra', status: 'inactive' } });
    const csv = 'serial,alias,model,branch,till\nTERM-0701,A,PAX A920,Centro,Caja 1\nTERM-0702,B,PAX A920,Centro,Caja 2';
    const r = await h.app.inject({ method: 'POST', url: '/api/v1/terminals/import', headers: { ...admin, 'content-type': 'text/csv' }, payload: csv });
    expect(r.statusCode, r.body).toBe(200);
    expect(await ultima('terminal.imported')).toMatchObject({ actorId: 'user-admin', entityType: 'terminal', entityId: null, detail: { count: '2' } });
  });
  it('apikey.created / revoked / rotated: guardan prefix y scope, nunca la llave; revocar dos veces deja una sola entrada', async () => {
    const k = await crearLlave(h, admin, 'write', 'Karate');
    expect(await ultima('apikey.created')).toMatchObject({ actorId: 'user-admin', entityType: 'apikey', entityId: k.id, detail: { prefix: k.prefix, scope: 'write' } });
    const nueva = (await post(`/api/v1/api-keys/${k.id}/rotate`)).json() as { id: string; key: string; prefix: string };
    expect(await ultima('apikey.rotated')).toMatchObject({ entityType: 'apikey', entityId: nueva.id, detail: { prefix: nueva.prefix, scope: 'write', previousId: k.id } });
    expect((await post(`/api/v1/api-keys/${nueva.id}/revoke`)).statusCode).toBe(200);
    expect((await post(`/api/v1/api-keys/${nueva.id}/revoke`)).statusCode).toBe(200);
    expect(await delTipo('apikey.revoked')).toHaveLength(1);
    expect(await ultima('apikey.revoked')).toMatchObject({ entityId: nueva.id, detail: { prefix: nueva.prefix, scope: 'write' } });
    const volcado = JSON.stringify(filasDeBitacora());
    for (const secreto of [k.key, nueva.key, createHash('sha256').update(k.key).digest('hex'), createHash('sha256').update(nueva.key).digest('hex')]) {
      expect(volcado).not.toContain(secreto);
    }
  });
  it('transaction.voided y transaction.refunded con folio e importe; lo rechazado no deja entrada', async () => {
    const a = await cobrar('12500');
    expect((await post(`/api/v1/transactions/${a.id}/void`, supervisor)).statusCode).toBe(200);
    expect(await ultima('transaction.voided')).toMatchObject({ actorId: 'user-supervisor', entityType: 'transaction', entityId: a.id, detail: { folio: String(a.folio), amount: '12500' } });
    expect((await post(`/api/v1/transactions/${a.id}/void`, supervisor)).statusCode).toBe(409);
    expect((await post(`/api/v1/transactions/${a.id}/void`, cajero)).statusCode).toBe(403);
    expect(await delTipo('transaction.voided')).toHaveLength(1);
    const b = await cobrar('8000');
    expect((await post(`/api/v1/transactions/${b.id}/refund`, admin, { amount: '3000' })).statusCode).toBe(200);
    expect(await ultima('transaction.refunded')).toMatchObject({ actorId: 'user-admin', entityType: 'transaction', entityId: b.id, detail: { folio: String(b.folio), amount: '3000' } });
    expect((await post(`/api/v1/transactions/${b.id}/refund`, admin, { amount: '9000' })).statusCode).toBeGreaterThanOrEqual(400);
    expect(await delTipo('transaction.refunded')).toHaveLength(1);
  });
  it('alert_settings.updated: con los valores nuevos como texto; un PUT inválido o prohibido no deja entrada', async () => {
    expect((await h.app.inject({ method: 'PUT', url: '/api/v1/alert-settings', headers: admin, payload: { batteryBelowPct: 30, voidAtLeastAmount: '5000' } })).statusCode).toBe(200);
    expect(await ultima('alert_settings.updated')).toMatchObject({
      actorId: 'user-admin', entityType: 'alert_settings', entityId: MERCHANT, detail: { batteryBelowPct: '30', voidAtLeastAmount: '5000' },
    });
    await h.app.inject({ method: 'PUT', url: '/api/v1/alert-settings', headers: admin, payload: { batteryBelowPct: 0, voidAtLeastAmount: '1' } });
    await h.app.inject({ method: 'PUT', url: '/api/v1/alert-settings', headers: supervisor, payload: { batteryBelowPct: 50, voidAtLeastAmount: '1' } });
    expect(await delTipo('alert_settings.updated')).toHaveLength(1);
  });
  it('cobrar, leer, marcar alertas y la API pública no se registran; un intento prohibido tampoco', async () => {
    const llave = await crearLlave(h, admin, 'write');
    const antes = await total();
    await cobrar();
    await get('/api/v1/transactions');
    await get('/api/v1/terminals');
    await get('/api/v1/alerts');
    await post('/api/v1/alerts/read-all');
    await h.app.inject({ method: 'POST', url: '/public/v1/transactions', headers: { ...bearer(llave.key), 'idempotency-key': crypto.randomUUID() }, payload: { terminalId: 'term-demo-0001', amount: '1000', method: 'card', brand: 'visa', last4: '4242' } });
    await post('/api/v1/terminals', cajero, { serial: 'TERM-0999', alias: 'x', model: 'x', branch: 'x', till: 'x' });
    expect(await total()).toBe(antes);
  });
  it('seq crece de uno en uno en orden de ocurrencia y no se reutiliza', async () => {
    const l = await todo();
    const seqs = l.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(new Set(seqs).size).toBe(seqs.length);
    await crearTerminal();
    const nueva = await ultima('terminal.created');
    expect(nueva.seq).toBeGreaterThan(seqs[0]!);
  });
});

describe('A9 · listado y filtros', () => {
  // Datos con tiempos distintos para filtrar por fecha.
  let tTerminal = 0;
  beforeEach(async () => {
    h.clock.advance(1000);
    await crearTerminal('TERM-0801');
    tTerminal = h.clock.nowMs();
    h.clock.advance(1000);
    await post('/api/v1/users', admin, { name: 'Luisa Paz', email: 'luisa@pippos.test', role: 'cajero' });
    h.clock.advance(1000);
    await post('/api/v1/api-keys', supervisor, { name: 'x', scope: 'read' }); // 403: sin efecto
    await crearLlave(h, admin);
  });

  it('forma {items,total,page,pageSize}, ítems con las 8 claves y orden seq descendente', async () => {
    const p = await pagina();
    expect(Object.keys(p).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(p).toMatchObject({ page: 1, pageSize: 20 });
    expect(p.items.length).toBe(Math.min(20, p.total));
    for (const e of p.items) expect(Object.keys(e).sort()).toEqual(CLAVES);
    expect(p.items.map((e) => e.seq)).toEqual([...p.items.map((e) => e.seq)].sort((a, b) => b - a));
  });
  it('paginación: páginas contiguas sin repetir ni saltar, total fijo', async () => {
    const todas = await todo();
    const p1 = await pagina('?pageSize=3&page=1');
    const p2 = await pagina('?pageSize=3&page=2');
    const ultimaPag = await pagina(`?pageSize=3&page=${Math.ceil(todas.length / 3)}`);
    expect(p1.total).toBe(todas.length);
    expect(p1.items).toEqual(todas.slice(0, 3));
    expect(p2.items).toEqual(todas.slice(3, 6));
    expect(ultimaPag.items).toEqual(todas.slice(Math.floor((todas.length - 1) / 3) * 3));
    expect((await pagina(`?pageSize=3&page=${Math.ceil(todas.length / 3) + 1}`)).items).toEqual([]);
  });
  it('cada filtro coincide con el oráculo (filtrar la lista completa en la prueba)', async () => {
    const todas = await todo();
    const casos: Array<[string, (e: Entrada) => boolean]> = [
      ['action=terminal.created', (e) => e.action === 'terminal.created'],
      ['actorId=user-supervisor', (e) => e.actorId === 'user-supervisor'],
      ['entityType=user', (e) => e.entityType === 'user'],
      [`entityId=${todas.find((e) => e.action === 'terminal.created')!.entityId}`, (e) => e.entityId === todas.find((x) => x.action === 'terminal.created')!.entityId],
      [`from=${tTerminal}`, (e) => e.atMs >= tTerminal],
      [`to=${tTerminal}`, (e) => e.atMs <= tTerminal],
      [`from=${tTerminal}&to=${tTerminal}`, (e) => e.atMs === tTerminal],
      ['action=auth.login&actorId=user-admin', (e) => e.action === 'auth.login' && e.actorId === 'user-admin'],
      ['entityType=apikey&from=1', (e) => e.entityType === 'apikey'],
    ];
    for (const [qs, predicado] of casos) {
      const esperado = todas.filter(predicado);
      expect(esperado.length, qs).toBeGreaterThan(0);
      const p = await pagina(`?pageSize=100&${qs}`);
      expect(p.items, qs).toEqual(esperado);
      expect(p.total, qs).toBe(esperado.length);
    }
    expect((await pagina('?action=user.created&actorId=user-cajero')).total).toBe(0);
  });
  it('from y to son inclusivos', async () => {
    const exacto = await pagina(`?from=${tTerminal}&to=${tTerminal}`);
    expect(exacto.items.map((e) => e.action)).toEqual(['terminal.created']);
    expect((await pagina(`?from=${tTerminal + 1}&to=${tTerminal + 1}`)).items.map((e) => e.action)).toEqual([]);
  });
  it('parámetros inválidos o desconocidos → 400 VALIDATION_ERROR', async () => {
    for (const qs of ['?action=user.deleted', '?page=0', '?pageSize=0', '?pageSize=101', '?from=ayer', '?actorId=', '?limit=5', '?cursor=x']) {
      const r = await get(`${BASE}${qs}`);
      expect(r.statusCode, qs).toBe(400);
      expect(r.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });
});

describe('A8 · inmutabilidad', () => {
  it('no existe ruta que modifique o borre la bitácora', async () => {
    const id = (await ultima('auth.login')).seq;
    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST'] as const) {
      for (const url of [BASE, `${BASE}/${id}`]) {
        const r = await h.app.inject({ method, url, headers: admin, payload: method === 'DELETE' ? undefined : {} });
        expect(r.statusCode, `${method} ${url}`).toBe(404);
      }
    }
    expect(await total()).toBeGreaterThan(0);
  });
  it('la base impide UPDATE y DELETE sobre audit_log', () => {
    const antes = filasDeBitacora();
    expect(antes.length).toBeGreaterThan(0);
    expect(() => h.db.exec("UPDATE audit_log SET action = 'x'")).toThrow();
    expect(() => h.db.exec("UPDATE audit_log SET actor_name = 'otro' WHERE seq = (SELECT MIN(seq) FROM audit_log)")).toThrow();
    expect(() => h.db.exec('DELETE FROM audit_log')).toThrow();
    expect(() => h.db.exec('DELETE FROM audit_log WHERE seq = (SELECT MIN(seq) FROM audit_log)')).toThrow();
    expect(filasDeBitacora()).toEqual(antes);
  });
  it('la base admite agregar filas (el seq no se reutiliza)', () => {
    const ins = () => h.db.prepare(
      `INSERT INTO audit_log (merchant_id, at_ms, actor_id, actor_name, action, entity_type, entity_id, detail_json)
       VALUES (?, 1, NULL, 'sistema', 'auth.login', 'user', NULL, '{}')`,
    ).run(MERCHANT);
    const a = Number(ins().lastInsertRowid);
    const b = Number(ins().lastInsertRowid);
    expect(b).toBe(a + 1);
  });
  it('/__test__/reset vacía bitácora, alertas, lecturas y umbrales, y la bitácora nueva sigue siendo inmutable', async () => {
    await get('/api/v1/alerts');
    await post('/api/v1/alerts/read-all');
    await h.app.inject({ method: 'PUT', url: '/api/v1/alert-settings', headers: admin, payload: { batteryBelowPct: 30, voidAtLeastAmount: '5000' } });
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n).toBeGreaterThan(0);
    expect((await h.app.inject({ method: 'POST', url: '/__test__/reset' })).statusCode).toBe(204);
    for (const tabla of ['audit_log', 'alerts', 'alert_reads', 'alert_settings']) {
      expect(h.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get(), tabla).toEqual({ n: 0 });
    }
    await login(h, 'admin@pippos.test');
    expect(filasDeBitacora()).toHaveLength(1);
    expect(() => h.db.exec("UPDATE audit_log SET action = 'x'")).toThrow();
    expect(() => h.db.exec('DELETE FROM audit_log')).toThrow();
  });
});

describe('A10 · exportación CSV', () => {
  const csv = (qs = '', headers = admin) => get(`${BASE}.csv${qs}`, headers);
  beforeEach(async () => {
    h.clock.advance(1000);
    await crearTerminal('TERM-0811');
    h.clock.advance(1000);
    await crearLlave(h, admin, 'read', 'Postman, "v2"');
  });

  it('cabeceras HTTP y nombre de archivo según from/to', async () => {
    const r = await csv();
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe('attachment; filename="auditoria-todo-todo.csv"');
    expect((await csv('?from=5&to=9')).headers['content-disposition']).toBe('attachment; filename="auditoria-5-9.csv"');
    expect((await csv('?from=5')).headers['content-disposition']).toBe('attachment; filename="auditoria-5-todo.csv"');
    expect((await csv('?to=9')).headers['content-disposition']).toBe('attachment; filename="auditoria-todo-9.csv"');
  });
  it('mismo contenido que la lista (oráculo): cabecera exacta, \\r\\n, mismas filas y orden', async () => {
    const r = await csv();
    expect(r.body.startsWith(`${CABECERA}\r\n`)).toBe(true);
    const filas = leerCsv(r.body);
    const esperado = await todo();
    expect(filas[0]).toEqual(CABECERA.split(','));
    expect(filas.slice(1)).toEqual(esperado.map((e) => [String(e.seq), String(e.atMs), e.actorId ?? '', seguro(e.actorName), e.action, e.entityType, e.entityId ?? '', JSON.stringify(e.detail)]));
    expect(filas.length).toBe(esperado.length + 1);
  });
  it('aplica los mismos filtros que la lista y sin coincidencias solo trae la cabecera', async () => {
    const filtradas = leerCsv((await csv('?action=terminal.created')).body).slice(1);
    const esperado = await todo('&action=terminal.created');
    expect(filtradas.map((f) => f[0])).toEqual(esperado.map((e) => String(e.seq)));
    expect((await csv('?action=user.created')).body).toBe(`${CABECERA}\r\n`);
  });
  it('page, pageSize y parámetros desconocidos → 400 (no se pagina)', async () => {
    for (const qs of ['?page=1', '?pageSize=5', '?foo=1', '?action=nope']) expect((await csv(qs)).statusCode, qs).toBe(400);
  });
  it('antídoto de inyección: un nombre que empieza por «=» sale con apóstrofe; coma y comillas se entrecomillan', async () => {
    h.db.prepare("UPDATE users SET name = ? WHERE id = 'user-admin'").run('=HYPERLINK("http://malo.test","clic")');
    h.clock.advance(1000);
    await crearTerminal('TERM-0812');
    const filas = leerCsv((await csv('?action=terminal.created')).body).slice(1);
    expect(filas[0]![3]).toBe(`'=HYPERLINK("http://malo.test","clic")`);
    const crudo = (await csv('?action=terminal.created')).body.split('\r\n')[1]!;
    expect(crudo).toContain(`"'=HYPERLINK(""http://malo.test"",""clic"")"`);
    for (const f of leerCsv((await csv()).body).slice(1)) expect(f[3]).not.toMatch(/^[=+\-@\t\r]/);
  });
  it('detail con comas y comillas sobrevive al ida y vuelta', async () => {
    const llave = (await delTipo('apikey.created'))[0]!;
    const fila = leerCsv((await csv('?action=apikey.created')).body)[1]!;
    expect(JSON.parse(fila[7]!)).toEqual(llave.detail);
  });
  it('tope de 5000 filas: trae las más recientes', async () => {
    const ins = h.db.prepare(
      `INSERT INTO audit_log (merchant_id, at_ms, actor_id, actor_name, action, entity_type, entity_id, detail_json)
       VALUES (?, ?, NULL, 'sistema', 'terminal.updated', 'terminal', 't', '{}')`,
    );
    h.db.exec('BEGIN');
    for (let i = 0; i < 5100; i++) ins.run(MERCHANT, 2_000_000_000_000 + i);
    h.db.exec('COMMIT');
    const filas = leerCsv((await csv()).body);
    expect(filas).toHaveLength(5001);
    const seqs = filas.slice(1).map((f) => Number(f[0]));
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    const maxSeq = (h.db.prepare('SELECT MAX(seq) AS m FROM audit_log').get() as { m: number }).m;
    expect(seqs[0]).toBe(maxSeq);
  });
});

describe('A1/A12 · permisos, aislamiento y secretos', () => {
  it('sin sesión 401; supervisor y cajero 403 en la lista y en el CSV', async () => {
    for (const url of [BASE, `${BASE}.csv`]) {
      expect((await h.app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
      for (const headers of [supervisor, cajero]) {
        const r = await get(url, headers);
        expect(r.statusCode, url).toBe(403);
        expect(r.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
      }
    }
  });
  it('BOLA: el admin de un comercio no ve la bitácora del otro, ni en la lista ni en el CSV', async () => {
    const ajeno = await comercioAjeno(h);
    await h.app.inject({ method: 'POST', url: '/api/v1/terminals', headers: ajeno, payload: { serial: 'AJENO-0002', alias: 'z', model: 'z', branch: 'z', till: 'z' } });
    const suya = await pagina('?pageSize=100', ajeno);
    expect(suya.items.length).toBeGreaterThan(0);
    expect(suya.items.every((e) => e.actorId === 'u-ajeno')).toBe(true);
    expect((await pagina('?actorId=u-ajeno')).total).toBe(0);
    expect((await get(`${BASE}.csv`)).body).not.toContain('u-ajeno');
    expect((await pagina(`?entityId=${suya.items[0]!.entityId}`)).total).toBe(0);
    expect((await get(`${BASE}.csv`, ajeno)).body).not.toContain('user-admin');
  });
  it('ningún detail ni el CSV contiene llaves, tokens de sesión ni contraseñas', async () => {
    const k = await crearLlave(h, admin, 'write');
    await post(`/api/v1/api-keys/${k.id}/rotate`);
    const sesion = tokenOf(await login(h, 'admin@pippos.test'));
    await login(h, 'admin@pippos.test', 'mala-contrasena-1');
    await post('/api/v1/me/password', withCookie(sesion), { current: DEMO_PASSWORD, next: CLAVE_NUEVA });
    admin = withCookie(tokenOf(await login(h, 'admin@pippos.test', CLAVE_NUEVA)));
    const salida = JSON.stringify(filasDeBitacora()) + (await get(`${BASE}.csv`)).body + JSON.stringify(await todo());
    for (const secreto of [k.key, sesion, DEMO_PASSWORD, CLAVE_NUEVA, 'mala-contrasena-1', 'h:']) expect(salida).not.toContain(secreto);
  });
});
