import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { COOKIE, DEMO_PASSWORD, type Harness, ORIGIN_AJENO, login, loginToken, makeApp, me, sinCorrelacion, withCookie } from './helpers/app';

const CLAVES_USUARIO = ['branchId', 'email', 'id', 'name', 'role', 'status'];
const CLAVES_MENSAJE = ['createdAt', 'id', 'kind', 'link', 'to']; // `to` = destinatario
const NUEVO = { name: 'Ana Pérez', email: 'ana@pippos.test', role: 'cajero' };
const CLAVE_BUENA = 'clave-nueva-2026';
const HORA = 3_600_000;

let h: Harness;
let admin: Record<string, string>;
let supervisor: Record<string, string>;
let cajero: Record<string, string>;

beforeEach(async () => {
  h = await makeApp({ loginRateMax: 100 });
  admin = withCookie(await loginToken(h, 'admin'));
  supervisor = withCookie(await loginToken(h, 'supervisor'));
  cajero = withCookie(await loginToken(h, 'cajero'));
});

const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const post = (url: string, payload?: unknown, headers = admin) =>
  h.app.inject({ method: 'POST', url, headers, payload: payload as object });
const patch = (url: string, payload: unknown, headers = admin) =>
  h.app.inject({ method: 'PATCH', url, headers, payload: payload as object });
const usuarios = async () => (await get('/api/v1/users')).json().items as Array<Record<string, unknown>>;
const sucursales = async () => (await get('/api/v1/branches')).json().items as Array<{ id: string; name: string; tills: Array<{ id: string; name: string }> }>;
const bandeja = async () => (await get('/api/v1/mailbox')).json().items as Array<Record<string, string | number>>;
const idSucursal = async (nombre: string) => (await sucursales()).find((s) => s.name === nombre)!.id;
const idUsuario = async (email: string) => (await usuarios()).find((u) => u.email === email)!.id as string;
const tokenDe = (link: string) => /^\/invitacion\?token=([A-Za-z0-9_-]+)$/.exec(link)![1];
// Las sesiones duran 8 h: tras adelantar el reloj hay que entrar de nuevo.
const reentrarAdmin = async () => { admin = withCookie(await loginToken(h, 'admin')); };
const aceptar = (token: string, password = CLAVE_BUENA) => post('/api/v1/invitations/accept', { token, password }, {});

// Invita a un usuario y devuelve su id y el token que quedó en la bandeja.
async function invitar(over: Record<string, unknown> = {}) {
  const cuerpo = { ...NUEVO, branchId: await idSucursal('Centro'), ...over };
  const res = await post('/api/v1/users', cuerpo);
  expect(res.statusCode).toBe(201);
  const mensaje = (await bandeja()).find((m) => m.to === res.json().email)!;
  return { id: res.json().id as string, email: res.json().email as string, token: tokenDe(String(mensaje.link)) };
}

// Un comercio ajeno con sucursal, caja y usuario, para las pruebas de aislamiento (BOLA).
function sembrarAjeno() {
  h.db.prepare("INSERT INTO merchants (id, name) VALUES ('m-ajeno', 'Otro comercio')").run();
  h.db.prepare("INSERT INTO branches (id, merchant_id, name) VALUES ('b-ajena', 'm-ajeno', 'Ajena')").run();
  h.db.prepare("INSERT INTO tills (id, branch_id, name) VALUES ('t-ajena', 'b-ajena', 'Caja X')").run();
  h.db
    .prepare(
      `INSERT INTO users (id, merchant_id, name, email, role, password_hash, language, theme, branch_id)
       VALUES ('u-ajeno', 'm-ajeno', 'Ajeno', 'ajeno@otro.test', 'admin', '', 'es', 'light', 'b-ajena')`,
    )
    .run();
  h.db
    .prepare("INSERT INTO mailbox (id, merchant_id, to_email, kind, link, created_at_ms) VALUES ('mb-ajeno', 'm-ajeno', 'ajeno@otro.test', 'invitation', '/invitacion?token=ajeno', 1)")
    .run();
}

describe('U1 permisos', () => {
  it('sin sesión: 401 en todo', async () => {
    for (const res of [
      await get('/api/v1/users', {}), await get('/api/v1/branches', {}), await get('/api/v1/mailbox', {}),
      await post('/api/v1/users', NUEVO, {}), await post('/api/v1/branches', { name: 'Sur' }, {}),
      await patch('/api/v1/users/x', { status: 'inactive' }, {}), await post('/api/v1/users/x/invitation', undefined, {}),
      await post('/api/v1/me/password', { current: 'a', next: 'b' }, {}),
    ]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('cajero: 403 FORBIDDEN en usuarios, bandeja y sucursales', async () => {
    const id = await idUsuario('supervisor@pippos.test');
    const centro = await idSucursal('Centro');
    for (const res of [
      await get('/api/v1/users', cajero), await get('/api/v1/mailbox', cajero), await get('/api/v1/branches', cajero),
      await post('/api/v1/users', NUEVO, cajero), await patch(`/api/v1/users/${id}`, { status: 'inactive' }, cajero),
      await post(`/api/v1/users/${id}/invitation`, undefined, cajero), await post('/api/v1/branches', { name: 'Sur' }, cajero),
      await post(`/api/v1/branches/${centro}/tills`, { name: 'Caja 9' }, cajero),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
  });

  it('supervisor: lee sucursales; todo lo demás 403 y no se crea nada', async () => {
    const id = await idUsuario('cajero@pippos.test');
    const centro = await idSucursal('Centro');
    expect((await get('/api/v1/branches', supervisor)).statusCode).toBe(200);
    for (const res of [
      await get('/api/v1/users', supervisor), await get('/api/v1/mailbox', supervisor),
      await post('/api/v1/users', NUEVO, supervisor), await patch(`/api/v1/users/${id}`, { status: 'inactive' }, supervisor),
      await post(`/api/v1/users/${id}/invitation`, undefined, supervisor), await post('/api/v1/branches', { name: 'Sur' }, supervisor),
      await post(`/api/v1/branches/${centro}/tills`, { name: 'Caja 9' }, supervisor),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    expect(await usuarios()).toHaveLength(3);
    expect(await sucursales()).toHaveLength(2);
    expect(await bandeja()).toHaveLength(0);
  });

  it('petición con efecto y Origin ajeno: 403 ORIGIN_NOT_ALLOWED y no escribe', async () => {
    for (const [url, payload] of [
      ['/api/v1/users', { ...NUEVO, branchId: null }], ['/api/v1/branches', { name: 'Sur' }],
      ['/api/v1/invitations/accept', { token: 'x', password: CLAVE_BUENA }], ['/api/v1/me/password', { current: DEMO_PASSWORD, next: CLAVE_BUENA }],
    ] as const) {
      const res = await h.app.inject({ method: 'POST', url, headers: { ...admin, origin: ORIGIN_AJENO }, payload });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
    }
    expect(await usuarios()).toHaveLength(3);
    expect(await sucursales()).toHaveLength(2);
  });
});

describe('U2 sucursales y cajas', () => {
  it('semilla: Centro (Caja 1, Caja 2) y Norte (Caja 3), con la forma exacta', async () => {
    const r = await get('/api/v1/branches');
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json())).toEqual(['items']);
    const items = r.json().items;
    expect(items.map((s: { name: string }) => s.name)).toEqual(['Centro', 'Norte']);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'name', 'tills']);
    expect(items[0].tills.map((t: { name: string }) => t.name)).toEqual(['Caja 1', 'Caja 2']);
    expect(Object.keys(items[0].tills[0]).sort()).toEqual(['id', 'name']);
    expect(items[1].tills.map((t: { name: string }) => t.name)).toEqual(['Caja 3']);
  });

  it('crear sucursal: 201, nombre sin espacios sobrantes, sin cajas, y el orden ignora mayúsculas', async () => {
    const r = await post('/api/v1/branches', { name: '  Sur  ' });
    expect(r.statusCode).toBe(201);
    expect(Object.keys(r.json()).sort()).toEqual(['id', 'name', 'tills']);
    expect(r.json().name).toBe('Sur');
    expect(r.json().tills).toEqual([]);
    expect((await post('/api/v1/branches', { name: 'abasto' })).statusCode).toBe(201);
    expect((await sucursales()).map((s) => s.name)).toEqual(['abasto', 'Centro', 'Norte', 'Sur']);
  });

  it('nombre repetido en el comercio (sin distinguir mayúsculas ni espacios) → 409 CONFLICT', async () => {
    for (const name of ['Centro', 'centro', ' CENTRO ']) {
      const r = await post('/api/v1/branches', { name });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CONFLICT');
    }
    expect(await sucursales()).toHaveLength(2);
  });

  const malas: [string, unknown][] = [
    ['vacío', { name: '' }], ['solo espacios', { name: '   ' }], ['61 caracteres', { name: 'x'.repeat(61) }],
    ['sin name', {}], ['name numérico', { name: 5 }], ['campo extra', { name: 'Sur', merchantId: 'm' }],
  ];
  for (const [nombre, cuerpo] of malas) {
    it(`sucursal con nombre ${nombre} → 400 VALIDATION_ERROR`, async () => {
      const r = await post('/api/v1/branches', cuerpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect(await sucursales()).toHaveLength(2);
    });
  }

  it('60 caracteres sí se aceptan', async () => {
    expect((await post('/api/v1/branches', { name: 'x'.repeat(60) })).statusCode).toBe(201);
  });

  it('agregar caja: 201 con la sucursal completa y cajas ordenadas; el nombre puede repetirse en otra sucursal', async () => {
    const centro = await idSucursal('Centro');
    const r = await post(`/api/v1/branches/${centro}/tills`, { name: ' caja 0 ' });
    expect(r.statusCode).toBe(201);
    expect(Object.keys(r.json()).sort()).toEqual(['id', 'name', 'tills']);
    expect(r.json().tills.map((t: { name: string }) => t.name)).toEqual(['caja 0', 'Caja 1', 'Caja 2']);
    const norte = await idSucursal('Norte');
    expect((await post(`/api/v1/branches/${norte}/tills`, { name: 'Caja 1' })).statusCode).toBe(201);
  });

  it('caja repetida en la sucursal → 409; nombre inválido o campo extra → 400', async () => {
    const centro = await idSucursal('Centro');
    const rep = await post(`/api/v1/branches/${centro}/tills`, { name: 'CAJA 1' });
    expect(rep.statusCode).toBe(409);
    expect(rep.json().error.code).toBe('CONFLICT');
    for (const cuerpo of [{ name: '' }, { name: 'x'.repeat(61) }, {}, { name: 'Caja 7', branchId: 'otra' }]) {
      expect((await post(`/api/v1/branches/${centro}/tills`, cuerpo)).statusCode).toBe(400);
    }
    expect((await sucursales()).find((s) => s.name === 'Centro')!.tills).toHaveLength(2);
  });

  it('sucursal inexistente o de otro comercio: 404 y no aparece en la lista', async () => {
    sembrarAjeno();
    for (const id of ['no-existe', 'b-ajena']) {
      const r = await post(`/api/v1/branches/${id}/tills`, { name: 'Caja 9' });
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
    }
    expect((await sucursales()).map((s) => s.name)).toEqual(['Centro', 'Norte']);
    expect((h.db.prepare("SELECT COUNT(*) AS n FROM tills WHERE branch_id = 'b-ajena'").get() as { n: number }).n).toBe(1);
  });

  it('el mismo nombre de sucursal puede existir en otro comercio', async () => {
    sembrarAjeno();
    h.db.prepare("INSERT INTO branches (id, merchant_id, name) VALUES ('b-ajena-2', 'm-ajeno', 'Sur')").run();
    expect((await post('/api/v1/branches', { name: 'Sur' })).statusCode).toBe(201);
  });
});

describe('U3 lista de usuarios', () => {
  it('semilla: 3 usuarios por nombre, forma exacta, cajero en Centro y sin hash', async () => {
    const r = await get('/api/v1/users');
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json())).toEqual(['items']);
    const items = r.json().items;
    expect(items.map((u: { email: string }) => u.email)).toEqual(['admin@pippos.test', 'cajero@pippos.test', 'supervisor@pippos.test']);
    for (const u of items) expect(Object.keys(u).sort()).toEqual(CLAVES_USUARIO);
    expect(items.map((u: { status: string }) => u.status)).toEqual(['active', 'active', 'active']);
    expect(items.map((u: { role: string }) => u.role)).toEqual(['admin', 'cajero', 'supervisor']);
    expect(items.map((u: { branchId: string | null }) => u.branchId)).toEqual([null, await idSucursal('Centro'), null]);
    expect(r.body).not.toContain('h:');
    expect(r.body).not.toMatch(/password|hash|token|attempt|locked/i);
  });

  it('orden por nombre sin distinguir mayúsculas y luego por email', async () => {
    const centro = await idSucursal('Centro');
    for (const [name, email] of [['zoe', 'z1@pippos.test'], ['Zulema', 'z2@pippos.test'], ['Igual', 'b@pippos.test'], ['Igual', 'a@pippos.test']]) {
      expect((await post('/api/v1/users', { name, email, role: 'cajero', branchId: centro })).statusCode).toBe(201);
    }
    expect((await usuarios()).map((u) => u.email)).toEqual([
      'admin@pippos.test', 'cajero@pippos.test', 'a@pippos.test', 'b@pippos.test', 'supervisor@pippos.test', 'z1@pippos.test', 'z2@pippos.test',
    ]);
  });

  it('no lista usuarios de otro comercio', async () => {
    sembrarAjeno();
    expect((await usuarios()).map((u) => u.email)).not.toContain('ajeno@otro.test');
    expect(await usuarios()).toHaveLength(3);
  });
});

describe('U4 alta de usuario', () => {
  it('201 con la forma exacta, estado invited, email normalizado, listado y UN mensaje en la bandeja', async () => {
    const centro = await idSucursal('Centro');
    const r = await post('/api/v1/users', { name: '  Ana Pérez ', email: '  ANA@Pippos.test ', role: 'cajero', branchId: centro });
    expect(r.statusCode).toBe(201);
    expect(Object.keys(r.json()).sort()).toEqual(CLAVES_USUARIO);
    expect(r.json()).toMatchObject({ name: 'Ana Pérez', email: 'ana@pippos.test', role: 'cajero', status: 'invited', branchId: centro });
    expect(typeof r.json().id).toBe('string');
    const lista = await usuarios();
    expect(lista).toHaveLength(4);
    expect(lista.find((u) => u.email === 'ana@pippos.test')).toEqual(r.json());
    const mensajes = await bandeja();
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].to).toBe('ana@pippos.test');
  });

  it('admin y supervisor pueden quedar sin sucursal (ausente o null) o con una', async () => {
    const norte = await idSucursal('Norte');
    const a = await post('/api/v1/users', { name: 'A', email: 'a1@pippos.test', role: 'admin' });
    const b = await post('/api/v1/users', { name: 'B', email: 'b1@pippos.test', role: 'supervisor', branchId: null });
    const c = await post('/api/v1/users', { name: 'C', email: 'c1@pippos.test', role: 'supervisor', branchId: norte });
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([201, 201, 201]);
    expect([a.json().branchId, b.json().branchId, c.json().branchId]).toEqual([null, null, norte]);
  });

  it('nombre de 80 caracteres sí; 81 no', async () => {
    const centro = await idSucursal('Centro');
    expect((await post('/api/v1/users', { ...NUEVO, name: 'n'.repeat(80), branchId: centro })).statusCode).toBe(201);
    expect((await post('/api/v1/users', { ...NUEVO, email: 'otro@pippos.test', name: 'n'.repeat(81), branchId: centro })).statusCode).toBe(400);
  });

  const malas: [string, Record<string, unknown>][] = [
    ['sin nombre', { email: 'x@pippos.test', role: 'admin' }],
    ['nombre vacío', { name: '   ', email: 'x@pippos.test', role: 'admin' }],
    ['email inválido', { name: 'X', email: 'no-es-email', role: 'admin' }],
    ['sin email', { name: 'X', role: 'admin' }],
    ['rol desconocido', { name: 'X', email: 'x@pippos.test', role: 'root' }],
    ['rol en mayúsculas', { name: 'X', email: 'x@pippos.test', role: 'ADMIN' }],
    ['sin rol', { name: 'X', email: 'x@pippos.test' }],
    ['cajero sin sucursal', { name: 'X', email: 'x@pippos.test', role: 'cajero' }],
    ['cajero con sucursal null', { name: 'X', email: 'x@pippos.test', role: 'cajero', branchId: null }],
    ['sucursal inexistente', { name: 'X', email: 'x@pippos.test', role: 'supervisor', branchId: 'no-existe' }],
    ['sucursal de otro comercio', { name: 'X', email: 'x@pippos.test', role: 'supervisor', branchId: 'b-ajena' }],
    ['sucursal numérica', { name: 'X', email: 'x@pippos.test', role: 'supervisor', branchId: 5 }],
    ['campo status', { name: 'X', email: 'x@pippos.test', role: 'admin', status: 'active' }],
    ['campo passwordHash', { name: 'X', email: 'x@pippos.test', role: 'admin', passwordHash: 'h:x' }],
    ['campo password', { name: 'X', email: 'x@pippos.test', role: 'admin', password: 'clave-nueva-2026' }],
    ['campo merchantId', { name: 'X', email: 'x@pippos.test', role: 'admin', merchantId: 'm-ajeno' }],
    ['campo id', { name: 'X', email: 'x@pippos.test', role: 'admin', id: 'fijo' }],
  ];
  for (const [nombre, cuerpo] of malas) {
    it(`${nombre} → 400 VALIDATION_ERROR y no crea nada`, async () => {
      sembrarAjeno();
      const r = await post('/api/v1/users', cuerpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect(await usuarios()).toHaveLength(3);
      expect(await bandeja()).toHaveLength(0);
    });
  }

  it('email repetido (aun en otras mayúsculas) → 409 CONFLICT, sin usuario ni mensaje nuevos', async () => {
    const centro = await idSucursal('Centro');
    for (const email of ['admin@pippos.test', 'ADMIN@pippos.test']) {
      const r = await post('/api/v1/users', { name: 'Otro', email, role: 'cajero', branchId: centro });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CONFLICT');
    }
    sembrarAjeno();
    expect((await post('/api/v1/users', { name: 'Otro', email: 'ajeno@otro.test', role: 'admin' })).statusCode).toBe(409);
    expect(await usuarios()).toHaveLength(3);
    expect((await bandeja()).filter((m) => m.id !== 'mb-ajeno')).toHaveLength(0);
  });
});

describe('U5 bandeja simulada', () => {
  it('mensaje con la forma exacta, enlace /invitacion?token= y hora del reloj', async () => {
    const { email } = await invitar();
    const [m] = await bandeja();
    expect(Object.keys(m).sort()).toEqual(CLAVES_MENSAJE);
    expect(m).toMatchObject({ to: email, kind: 'invitation', createdAt: h.clock.nowMs() });
    expect(String(m.link)).toMatch(/^\/invitacion\?token=[A-Za-z0-9_-]+$/);
  });

  it('más reciente primero, y con la misma hora el último insertado primero', async () => {
    await invitar({ email: 'a1@pippos.test' });
    await invitar({ email: 'b1@pippos.test' });
    h.clock.advance(1000);
    await invitar({ email: 'c1@pippos.test' });
    expect((await bandeja()).map((m) => m.to)).toEqual(['c1@pippos.test', 'b1@pippos.test', 'a1@pippos.test']);
  });

  it('la BD guarda solo el sha256 del token, no el token', async () => {
    const { token } = await invitar();
    const filas = h.db.prepare('SELECT token_hash AS t FROM invitations').all() as Array<{ t: string }>;
    expect(filas.map((f) => f.t)).toEqual([createHash('sha256').update(token).digest('hex')]);
    expect(JSON.stringify(h.db.prepare('SELECT * FROM invitations').all())).not.toContain(token);
  });

  it('no muestra mensajes de otro comercio', async () => {
    sembrarAjeno();
    expect(await bandeja()).toEqual([]);
  });
});

describe('U6 aceptar la invitación', () => {
  it('204 sin cookie; el usuario pasa a active, entra con su clave y la clave de la demo no vale', async () => {
    const { id, email, token } = await invitar();
    const r = await aceptar(token);
    expect(r.statusCode).toBe(204);
    expect(r.body).toBe('');
    expect(r.cookies.find((c) => c.name === COOKIE)).toBeUndefined();
    expect((await usuarios()).find((u) => u.id === id)!.status).toBe('active');
    const ok = await login(h, email, CLAVE_BUENA);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ email, role: 'cajero' });
    expect((await login(h, email, DEMO_PASSWORD)).statusCode).toBe(401);
  });

  it('antes de aceptar no se puede entrar (ni con clave vacía ni con la de la demo)', async () => {
    const { email } = await invitar();
    for (const password of [DEMO_PASSWORD, 'x']) {
      const r = await login(h, email, password);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('el token sirve una sola vez', async () => {
    const { token } = await invitar();
    expect((await aceptar(token)).statusCode).toBe(204);
    const otra = await aceptar(token, 'otra-clave-2027');
    expect(otra.statusCode).toBe(404);
    expect(otra.json().error.code).toBe('NOT_FOUND');
  });

  it('token desconocido → 404; cuerpo mal formado o con campos extra → 400', async () => {
    expect((await aceptar('no-existe')).statusCode).toBe(404);
    for (const cuerpo of [{}, { token: 'x' }, { password: CLAVE_BUENA }, { token: '', password: CLAVE_BUENA }, { token: 5, password: CLAVE_BUENA },
      { token: 'x', password: CLAVE_BUENA, role: 'admin' }]) {
      const r = await post('/api/v1/invitations/accept', cuerpo, {});
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  const debiles: [string, string][] = [
    ['9 caracteres', 'abcdefg12'], ['sin número', 'solo-letras-largas'], ['sin letra', '1234567890123'],
    ['129 caracteres', `${'a'.repeat(128)}1`], ['vacía', ''],
  ];
  for (const [nombre, password] of debiles) {
    it(`contraseña ${nombre} → 400 y el token sigue valiendo`, async () => {
      const { token } = await invitar();
      const r = await aceptar(token, password);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect((await aceptar(token)).statusCode).toBe(204);
    });
  }

  it('bordes de la política: 10 y 128 caracteres sí', async () => {
    const a = await invitar({ email: 'a1@pippos.test' });
    const b = await invitar({ email: 'b1@pippos.test' });
    expect((await aceptar(a.token, 'abcdefgh12')).statusCode).toBe(204);
    expect((await aceptar(b.token, `${'a'.repeat(127)}1`)).statusCode).toBe(204);
  });

  it('vigencia de 48 h: a las 48 h menos 1 ms sirve; a las 48 h exactas no', async () => {
    const a = await invitar({ email: 'a1@pippos.test' });
    const b = await invitar({ email: 'b1@pippos.test' });
    h.clock.advance(48 * HORA - 1);
    expect((await aceptar(a.token)).statusCode).toBe(204);
    h.clock.advance(1);
    const r = await aceptar(b.token);
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
    await reentrarAdmin();
    expect((await usuarios()).find((u) => u.id === b.id)!.status).toBe('invited');
  });

  it('si el usuario se desactivó antes de aceptar → 404 y sigue sin contraseña', async () => {
    const { id, email, token } = await invitar();
    expect((await patch(`/api/v1/users/${id}`, { status: 'inactive' })).statusCode).toBe(200);
    expect((await aceptar(token)).statusCode).toBe(404);
    expect((await login(h, email, CLAVE_BUENA)).statusCode).toBe(401);
  });

  it('dos aceptaciones simultáneas: gana una (204) y la otra pierde (404); entra solo la ganadora', async () => {
    const { email, token } = await invitar();
    const claves = ['clave-ganadora-1', 'clave-ganadora-2'];
    const res = await Promise.all(claves.map((p) => aceptar(token, p)));
    expect(res.map((r) => r.statusCode).sort()).toEqual([204, 404]);
    const ganadora = claves[res.findIndex((r) => r.statusCode === 204)];
    const perdedora = claves[res.findIndex((r) => r.statusCode === 404)];
    expect((await login(h, email, ganadora)).statusCode).toBe(200);
    expect((await login(h, email, perdedora)).statusCode).toBe(401);
  });
});

describe('U7 reenviar la invitación', () => {
  it('204: mensaje nuevo, el token viejo muere y el nuevo sirve', async () => {
    const { id, email, token } = await invitar();
    const r = await post(`/api/v1/users/${id}/invitation`);
    expect(r.statusCode).toBe(204);
    const mensajes = (await bandeja()).filter((m) => m.to === email);
    expect(mensajes).toHaveLength(2);
    const nuevo = tokenDe(String(mensajes[0].link));
    expect(nuevo).not.toBe(token);
    expect((await aceptar(token)).statusCode).toBe(404);
    expect((await aceptar(nuevo)).statusCode).toBe(204);
  });

  it('renueva la vigencia: 80 h después de la primera pero 40 h después de reenviar, sirve', async () => {
    const { id, email } = await invitar();
    h.clock.advance(40 * HORA);
    await reentrarAdmin();
    expect((await post(`/api/v1/users/${id}/invitation`)).statusCode).toBe(204);
    h.clock.advance(40 * HORA);
    await reentrarAdmin();
    const nuevo = tokenDe(String((await bandeja()).find((m) => m.to === email)!.link));
    expect((await aceptar(nuevo)).statusCode).toBe(204);
  });

  it('un usuario active o inactive → 409 CONFLICT y la bandeja no cambia', async () => {
    const activo = await idUsuario('supervisor@pippos.test');
    const r = await post(`/api/v1/users/${activo}/invitation`);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('CONFLICT');
    const { id } = await invitar();
    await patch(`/api/v1/users/${id}`, { status: 'inactive' });
    expect((await post(`/api/v1/users/${id}/invitation`)).statusCode).toBe(409);
    expect(await bandeja()).toHaveLength(1);
  });

  it('usuario inexistente o de otro comercio → 404', async () => {
    sembrarAjeno();
    for (const id of ['no-existe', 'u-ajeno']) {
      const r = await post(`/api/v1/users/${id}/invitation`);
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
    }
    expect((await bandeja()).filter((m) => m.id !== 'mb-ajeno')).toHaveLength(0);
  });
});

describe('U8 editar, activar y desactivar', () => {
  it('desactivar: 200 inactive, la sesión muere y el login falla igual que una clave mala', async () => {
    const id = await idUsuario('supervisor@pippos.test');
    const r = await patch(`/api/v1/users/${id}`, { status: 'inactive' });
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json()).sort()).toEqual(CLAVES_USUARIO);
    expect(r.json().status).toBe('inactive');
    expect((await me(h, supervisor.cookie)).statusCode).toBe(401);
    const bien = await login(h, 'supervisor@pippos.test');
    const mal = await login(h, 'supervisor@pippos.test', 'clave-mala-123');
    expect(bien.statusCode).toBe(401);
    expect(sinCorrelacion(bien)).toEqual(sinCorrelacion(mal));
  });

  it('reactivar devuelve active y puede volver a entrar; reactivar a quien nunca aceptó lo deja invited', async () => {
    const id = await idUsuario('supervisor@pippos.test');
    await patch(`/api/v1/users/${id}`, { status: 'inactive' });
    expect((await patch(`/api/v1/users/${id}`, { status: 'active' })).json().status).toBe('active');
    expect((await login(h, 'supervisor@pippos.test')).statusCode).toBe(200);
    const nuevo = await invitar();
    await patch(`/api/v1/users/${nuevo.id}`, { status: 'inactive' });
    expect((await patch(`/api/v1/users/${nuevo.id}`, { status: 'active' })).json().status).toBe('invited');
  });

  it('cambiar el rol rige en la siguiente petición', async () => {
    const id = await idUsuario('supervisor@pippos.test');
    const centro = await idSucursal('Centro');
    expect((await get('/api/v1/branches', supervisor)).statusCode).toBe(200);
    const r = await patch(`/api/v1/users/${id}`, { role: 'cajero', branchId: centro });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ role: 'cajero', branchId: centro });
    expect((await get('/api/v1/branches', supervisor)).statusCode).toBe(403);
  });

  it('un cajero no puede quedar sin sucursal (por rol nuevo ni por quitarla) → 400 y no cambia', async () => {
    const sup = await idUsuario('supervisor@pippos.test');
    const caj = await idUsuario('cajero@pippos.test');
    expect((await patch(`/api/v1/users/${sup}`, { role: 'cajero' })).statusCode).toBe(400);
    expect((await patch(`/api/v1/users/${caj}`, { branchId: null })).statusCode).toBe(400);
    const lista = await usuarios();
    expect(lista.find((u) => u.id === sup)).toMatchObject({ role: 'supervisor', branchId: null });
    expect(lista.find((u) => u.id === caj)!.branchId).toBe(await idSucursal('Centro'));
  });

  it('cambiar de sucursal; quitarla a un supervisor (null) está permitido', async () => {
    const caj = await idUsuario('cajero@pippos.test');
    const norte = await idSucursal('Norte');
    expect((await patch(`/api/v1/users/${caj}`, { branchId: norte })).json().branchId).toBe(norte);
    const sup = await idUsuario('supervisor@pippos.test');
    await patch(`/api/v1/users/${sup}`, { branchId: norte });
    expect((await patch(`/api/v1/users/${sup}`, { branchId: null })).json().branchId).toBeNull();
  });

  const malos: [string, unknown][] = [
    ['sin campos', {}], ['estado invited', { status: 'invited' }], ['estado desconocido', { status: 'borrado' }],
    ['rol desconocido', { role: 'root' }], ['sucursal de otro comercio', { branchId: 'b-ajena' }],
    ['campo email', { email: 'otro@pippos.test' }], ['campo name', { name: 'Otro' }], ['campo passwordHash', { passwordHash: 'h:x' }],
    ['campo merchantId', { merchantId: 'm-ajeno' }], ['campo id', { id: 'otro' }],
  ];
  for (const [nombre, cuerpo] of malos) {
    it(`${nombre} → 400 VALIDATION_ERROR y no cambia nada`, async () => {
      sembrarAjeno();
      const antes = await usuarios();
      const id = await idUsuario('supervisor@pippos.test');
      const r = await patch(`/api/v1/users/${id}`, cuerpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect(await usuarios()).toEqual(antes);
    });
  }

  it('sobre uno mismo: desactivarse o cambiar de rol → 409 CONFLICT; lo que no cambia, 200', async () => {
    const yo = await idUsuario('admin@pippos.test');
    for (const cuerpo of [{ status: 'inactive' }, { role: 'supervisor' }]) {
      const r = await patch(`/api/v1/users/${yo}`, cuerpo);
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CONFLICT');
    }
    expect((await patch(`/api/v1/users/${yo}`, { role: 'admin', status: 'active' })).statusCode).toBe(200);
    expect((await me(h, admin.cookie)).json().role).toBe('admin');
  });

  it('otro admin sí puede bajarse de rol o desactivarse (el actor sigue siendo admin)', async () => {
    const otro = await invitar({ email: 'adm2@pippos.test', role: 'admin', branchId: null });
    expect((await patch(`/api/v1/users/${otro.id}`, { role: 'supervisor' })).json().role).toBe('supervisor');
    expect((await patch(`/api/v1/users/${otro.id}`, { status: 'inactive' })).json().status).toBe('inactive');
  });

  it('usuario inexistente o de otro comercio → 404 y el ajeno no cambia', async () => {
    sembrarAjeno();
    for (const id of ['no-existe', 'u-ajeno']) {
      const r = await patch(`/api/v1/users/${id}`, { status: 'inactive' });
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
    }
    expect((h.db.prepare("SELECT active FROM users WHERE id = 'u-ajeno'").get() as { active: number }).active).toBe(1);
  });
});

describe('U9 cambiar la contraseña', () => {
  const cambiar = (current: unknown, next: unknown, headers = cajero) => post('/api/v1/me/password', { current, next }, headers);

  it('204: borra TODAS las sesiones del usuario, expira la cookie y rige la clave nueva', async () => {
    const otraSesion = withCookie((await login(h, 'cajero@pippos.test').then((r) => r.cookies.find((c) => c.name === COOKIE)!.value)));
    const r = await cambiar(DEMO_PASSWORD, CLAVE_BUENA);
    expect(r.statusCode).toBe(204);
    expect(r.body).toBe('');
    const c = r.cookies.find((x) => x.name === COOKIE);
    expect(c).toBeDefined();
    expect(c?.value === '' || c?.maxAge === 0 || (c?.expires && c.expires.getTime() < Date.now())).toBe(true);
    expect((await me(h, cajero.cookie)).statusCode).toBe(401);
    expect((await me(h, otraSesion.cookie)).statusCode).toBe(401);
    expect((await login(h, 'cajero@pippos.test', DEMO_PASSWORD)).statusCode).toBe(401);
    expect((await login(h, 'cajero@pippos.test', CLAVE_BUENA)).statusCode).toBe(200);
  });

  it('no toca las sesiones ni la clave de otros usuarios', async () => {
    expect((await cambiar(DEMO_PASSWORD, CLAVE_BUENA)).statusCode).toBe(204);
    expect((await me(h, admin.cookie)).statusCode).toBe(200);
    expect((await login(h, 'admin@pippos.test', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('clave actual mala → 401 INVALID_CREDENTIALS y no cambia nada', async () => {
    const r = await cambiar('clave-mala-123', CLAVE_BUENA);
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('INVALID_CREDENTIALS');
    expect((await me(h, cajero.cookie)).statusCode).toBe(200);
    expect((await login(h, 'cajero@pippos.test', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  const nuevas: [string, string][] = [
    ['de 9 caracteres', 'abcdefg12'], ['sin número', 'solo-letras-largas'], ['sin letra', '1234567890123'],
    ['de 129 caracteres', `${'a'.repeat(128)}1`], ['igual a la actual', DEMO_PASSWORD],
  ];
  for (const [nombre, next] of nuevas) {
    it(`clave nueva ${nombre} → 400 y no cambia nada`, async () => {
      const r = await cambiar(DEMO_PASSWORD, next);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect((await me(h, cajero.cookie)).statusCode).toBe(200);
    });
  }

  it('cuerpo con campos de menos o de más → 400', async () => {
    for (const cuerpo of [{}, { current: DEMO_PASSWORD }, { next: CLAVE_BUENA }, { current: DEMO_PASSWORD, next: CLAVE_BUENA, role: 'admin' }, { current: 5, next: CLAVE_BUENA }]) {
      expect((await post('/api/v1/me/password', cuerpo, cajero)).statusCode).toBe(400);
    }
  });
});
