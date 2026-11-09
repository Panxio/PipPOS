import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, type Harness, login, loginToken, makeApp, tokenOf, withCookie } from './helpers/app';

const BASE = '/api/v1/reports';
const DIA = 86_400_000;
const TZ = -180;
const TERMINALES = ['term-demo-0001', 'term-demo-0002', 'term-demo-0003'];
const CAJEROS = ['user-admin', 'user-supervisor', 'user-cajero'];
const METODOS = ['card', 'wallet'] as const;
const MARCAS = ['visa', 'mastercard', 'amex'] as const;
const ESTADOS = ['approved', 'approved', 'approved', 'partially_refunded', 'declined', 'refunded', 'voided', 'approved', 'timeout', 'approved'] as const;
const GRUPOS = ['day', 'hour', 'terminal', 'cashier', 'method', 'brand'] as const;
type Grupo = (typeof GRUPOS)[number];

const T0 = Date.UTC(2024, 0, 10, 12, 0, 0);
const DESDE = Date.UTC(2024, 0, 9);
const HASTA = Date.UTC(2024, 0, 17) - 1;

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
const get = (url: string, headers = admin) => h.app.inject({ method: 'GET', url, headers });
const inyectar = async (over: Body) => {
  const r = await h.app.inject({
    method: 'POST', url: '/__test__/transactions',
    payload: { terminalId: TERMINALES[0], cashierId: CAJEROS[0], amount: '1000', method: 'card', brand: 'visa', last4: '4242',
      status: 'approved', createdAt: T0, ...over },
  });
  expect(r.statusCode, JSON.stringify(over)).toBe(201);
};
const qs = (p: Record<string, string | number | boolean>) =>
  '?' + Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
const rango = { from: DESDE, to: HASTA, tzOffsetMin: TZ };
const resumen = async (extra: Record<string, string | number | boolean> = {}, headers = admin) => {
  const r = await get(`${BASE}/summary${qs({ ...rango, ...extra })}`, headers);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { range: { from: number; to: number }; kpis: Record<string, unknown>; previous?: { range: unknown; kpis: Record<string, unknown> } };
};
const ventas = async (groupBy: string, extra: Record<string, string | number> = {}, headers = admin) => {
  const r = await get(`${BASE}/sales${qs({ ...rango, groupBy, ...extra })}`, headers);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { groupBy: string; items: Array<{ key: string; label: string; sales: number; totalNet: string }> };
};

// Generador determinista (Park-Miller) para poblar ~120 transacciones en 5,5 días.
async function poblar(n = 120): Promise<void> {
  let x = 20_240_110;
  const azar = (m: number) => { x = (x * 48_271) % 2_147_483_647; return x % m; };
  for (let i = 0; i < n; i++) {
    const estado = ESTADOS[i % ESTADOS.length]!;
    let amount = 1 + azar(99_999_999);
    if (i % 17 === 0) amount = 99_999_999;
    if (i % 23 === 0) amount = 2;
    let refunded = 0;
    if (estado === 'partially_refunded') refunded = 1 + azar(amount - 1);
    if (estado === 'refunded') refunded = amount;
    await inyectar({
      terminalId: TERMINALES[azar(3)], cashierId: CAJEROS[azar(3)], method: METODOS[azar(2)], brand: MARCAS[azar(3)],
      amount: String(amount), status: estado, refundedAmount: String(refunded), createdAt: T0 + i * 4_000_000 + azar(1_000_000),
    });
  }
}

// ---- Oráculo independiente: recalcula desde la lista cruda de GET /transactions, con Date y BigInt ----
interface Cruda { createdAt: number; amount: string; refundedAmount: string; status: string; terminalId: string; cashierId: string; method: string; brand: string }
async function crudas(): Promise<Cruda[]> {
  const todas: Cruda[] = [];
  for (let page = 1; ; page++) {
    const r = await get(`/api/v1/transactions?page=${page}&pageSize=100`);
    const b = r.json() as { items: Cruda[]; total: number };
    todas.push(...b.items);
    if (todas.length >= b.total) return todas;
  }
}
const esVentaO = (s: string) => ['approved', 'partially_refunded', 'refunded'].includes(s);
const enRango = (t: Cruda, from: number, to: number) => t.createdAt >= from && t.createdAt <= to;
function kpisO(todas: Cruda[], from: number, to: number) {
  const dentro = todas.filter((t) => enRango(t, from, to));
  const v = dentro.filter((t) => esVentaO(t.status));
  const anuladas = dentro.filter((t) => t.status === 'voided');
  const totalNet = v.reduce((s, t) => s + BigInt(t.amount) - BigInt(t.refundedAmount), 0n);
  return {
    totalNet: String(totalNet), sales: v.length, avgTicket: String(v.length === 0 ? 0n : totalNet / BigInt(v.length)),
    attempts: dentro.length, approvalBp: dentro.length === 0 ? 0 : Math.floor(((v.length + anuladas.length) * 10_000) / dentro.length),
    voidedCount: anuladas.length, voidedAmount: String(anuladas.reduce((s, t) => s + BigInt(t.amount), 0n)),
  };
}
async function etiquetas() {
  const term = (await get('/api/v1/terminals?pageSize=100')).json() as { items: Array<{ id: string; alias: string }> };
  const usr = (await get('/api/v1/users')).json() as { items: Array<{ id: string; name: string }> };
  return { terminal: new Map(term.items.map((t) => [t.id, t.alias])), cashier: new Map(usr.items.map((u) => [u.id, u.name])) };
}
async function ventasO(todas: Cruda[], g: Grupo, from: number, to: number, tz: number) {
  const local = (ms: number) => new Date(ms + tz * 60_000).toISOString();
  const nom = await etiquetas();
  const acum = new Map<string, { sales: number; net: bigint }>();
  const suma = (key: string, t: Cruda) => {
    const a = acum.get(key) ?? { sales: 0, net: 0n };
    acum.set(key, { sales: a.sales + 1, net: a.net + BigInt(t.amount) - BigInt(t.refundedAmount) });
  };
  for (const t of todas.filter((x) => enRango(x, from, to) && esVentaO(x.status))) {
    const key = g === 'day' ? local(t.createdAt).slice(0, 10) : g === 'hour' ? local(t.createdAt).slice(11, 13)
      : g === 'terminal' ? t.terminalId : g === 'cashier' ? t.cashierId : g === 'method' ? t.method : t.brand;
    suma(key, t);
  }
  const labelDe = (key: string) => (g === 'terminal' ? nom.terminal.get(key) ?? '' : g === 'cashier' ? nom.cashier.get(key) ?? '' : key);
  if (g === 'day') {
    const items: Array<{ key: string; label: string; sales: number; totalNet: string }> = [];
    for (let d = Date.parse(`${local(from).slice(0, 10)}T00:00:00Z`); d <= Date.parse(`${local(to).slice(0, 10)}T00:00:00Z`); d += DIA) {
      const key = new Date(d).toISOString().slice(0, 10);
      const a = acum.get(key);
      items.push({ key, label: key, sales: a?.sales ?? 0, totalNet: String(a?.net ?? 0n) });
    }
    return items;
  }
  if (g === 'hour') {
    return Array.from({ length: 24 }, (_, i) => {
      const key = String(i).padStart(2, '0');
      const a = acum.get(key);
      return { key, label: key, sales: a?.sales ?? 0, totalNet: String(a?.net ?? 0n) };
    });
  }
  return [...acum.entries()]
    .sort(([ka, a], [kb, b]) => (a.net === b.net ? (ka < kb ? -1 : 1) : a.net > b.net ? -1 : 1))
    .map(([key, a]) => ({ key, label: labelDe(key), sales: a.sales, totalNet: String(a.net) }));
}

// Segundo comercio con su propio administrador y terminal.
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

describe('R1 permisos', () => {
  const rutas = [`/summary${qs(rango)}`, `/sales${qs({ ...rango, groupBy: 'day' })}`, `/sales.csv${qs({ ...rango, groupBy: 'day' })}`];
  it('sin sesión 401', async () => {
    for (const r of rutas) expect((await h.app.inject({ method: 'GET', url: BASE + r })).statusCode, r).toBe(401);
  });
  it('el cajero recibe 403 FORBIDDEN en las tres rutas', async () => {
    for (const r of rutas) {
      const res = await get(BASE + r, cajero);
      expect(res.statusCode, r).toBe(403);
      expect((res.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    }
  });
  it('admin y supervisor leen', async () => {
    for (const r of rutas) {
      expect((await get(BASE + r, admin)).statusCode, r).toBe(200);
      expect((await get(BASE + r, supervisor)).statusCode, r).toBe(200);
    }
  });
});

describe('R2 parámetros', () => {
  const resumenCon = (p: Record<string, string | number | boolean>) => get(`${BASE}/summary${qs(p)}`);
  const malos = (p: Record<string, string | number | boolean>, motivo: string) =>
    it(motivo, async () => {
      for (const ruta of ['summary', 'sales', 'sales.csv']) {
        // summary no admite groupBy: sin él, el 400 solo puede venir del parámetro malo.
        const r = await get(`${BASE}/${ruta}${qs(ruta === 'summary' ? p : { groupBy: 'day', ...p })}`);
        expect(r.statusCode, `${ruta} ${JSON.stringify(p)}`).toBe(400);
        expect((r.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      }
    });
  malos({ to: HASTA, tzOffsetMin: TZ }, 'falta from');
  malos({ from: DESDE, tzOffsetMin: TZ }, 'falta to');
  malos({ from: DESDE, to: HASTA }, 'falta tzOffsetMin');
  malos({ from: HASTA, to: DESDE, tzOffsetMin: TZ }, 'from mayor que to');
  malos({ from: -1, to: HASTA, tzOffsetMin: TZ }, 'from negativo');
  malos({ from: '1e3', to: HASTA, tzOffsetMin: TZ }, 'from en notación científica');
  malos({ from: 0, to: 366 * DIA, tzOffsetMin: TZ }, 'más de 366 días (366 días y 1 ms)');
  malos({ ...rango, tzOffsetMin: -721 }, 'tzOffsetMin bajo −720');
  malos({ ...rango, tzOffsetMin: 841 }, 'tzOffsetMin sobre 840');
  malos({ ...rango, tzOffsetMin: 1.5 }, 'tzOffsetMin no entero');
  malos({ ...rango, tzOffsetMin: 'abc' }, 'tzOffsetMin no numérico');
  malos({ ...rango, extra: 1 }, 'parámetro desconocido');

  it('exactamente 366 días es válido; los extremos de tzOffsetMin también', async () => {
    expect((await resumenCon({ from: 0, to: 366 * DIA - 1, tzOffsetMin: 0 })).statusCode).toBe(200);
    expect((await resumenCon({ ...rango, tzOffsetMin: -720 })).statusCode).toBe(200);
    expect((await resumenCon({ ...rango, tzOffsetMin: 840 })).statusCode).toBe(200);
    expect((await resumenCon({ from: 5, to: 5, tzOffsetMin: 0 })).statusCode).toBe(200);
  });
  it('compare solo vale en summary y solo true|false', async () => {
    expect((await resumenCon({ ...rango, compare: 'yes' })).statusCode).toBe(400);
    expect((await resumenCon({ ...rango, compare: 'false' })).statusCode).toBe(200);
    expect((await get(`${BASE}/sales${qs({ ...rango, groupBy: 'day', compare: true })}`)).statusCode).toBe(400);
    expect((await get(`${BASE}/sales.csv${qs({ ...rango, groupBy: 'day', compare: true })}`)).statusCode).toBe(400);
  });
  it('groupBy es obligatorio y de la lista en sales y sales.csv', async () => {
    for (const ruta of ['sales', 'sales.csv']) {
      expect((await get(`${BASE}/${ruta}${qs(rango)}`)).statusCode, ruta).toBe(400);
      expect((await get(`${BASE}/${ruta}${qs({ ...rango, groupBy: 'week' })}`)).statusCode, ruta).toBe(400);
    }
    expect((await get(`${BASE}/summary${qs({ ...rango, groupBy: 'day' })}`)).statusCode).toBe(400);
  });
});

describe('R4 summary', () => {
  it('sin transacciones todo es cero', async () => {
    const b = await resumen();
    expect(b.range).toEqual({ from: DESDE, to: HASTA });
    expect(b.kpis).toEqual({ totalNet: '0', sales: 0, avgTicket: '0', attempts: 0, approvalBp: 0, voidedCount: 0, voidedAmount: '0' });
    expect(b).not.toHaveProperty('previous');
  });
  it('valores a mano: neto, ticket truncado, aprobación en puntos base, anuladas aparte', async () => {
    await inyectar({ amount: '1000' });
    await inyectar({ amount: '5000', status: 'partially_refunded', refundedAmount: '2000' });
    await inyectar({ amount: '400', status: 'refunded', refundedAmount: '400' });
    await inyectar({ amount: '700', status: 'voided' });
    await inyectar({ amount: '300', status: 'declined' });
    await inyectar({ amount: '200', status: 'timeout' });
    await inyectar({ amount: '2001' });
    expect((await resumen()).kpis).toEqual({
      totalNet: '6001', sales: 4, avgTicket: '1500', attempts: 7, approvalBp: 7142, voidedCount: 1, voidedAmount: '700',
    });
  });
  it('coincide con el oráculo en el rango completo y en subrangos, con y sin compare', async () => {
    await poblar();
    const todas = await crudas();
    expect(todas).toHaveLength(120);
    const rangos: Array<[number, number]> = [
      [DESDE, HASTA], [T0 + DIA, T0 + 3 * DIA], [T0 + 2 * DIA + 12_345, T0 + 2 * DIA + 12_345], [HASTA + 1, HASTA + DIA],
    ];
    for (const [from, to] of rangos) {
      const b = await resumen({ from, to });
      expect(b.kpis, `${from}-${to}`).toEqual(kpisO(todas, from, to));
      expect(b).not.toHaveProperty('previous');
      const c = await resumen({ from, to, compare: true });
      const largo = to - from + 1;
      expect(c.kpis).toEqual(kpisO(todas, from, to));
      expect(c.previous, `${from}-${to}`).toEqual({ range: { from: from - largo, to: from - 1 }, kpis: kpisO(todas, from - largo, from - 1) });
    }
  });
  it('tipos: importes en string, conteos y puntos base en número', async () => {
    await inyectar({ amount: '99999999' });
    const k = (await resumen()).kpis;
    expect(Object.keys(k).sort()).toEqual(['approvalBp', 'attempts', 'avgTicket', 'sales', 'totalNet', 'voidedAmount', 'voidedCount']);
    for (const c of ['totalNet', 'avgTicket', 'voidedAmount']) expect(typeof k[c], c).toBe('string');
    for (const c of ['sales', 'attempts', 'approvalBp', 'voidedCount']) expect(typeof k[c], c).toBe('number');
  });
});

describe('R5 sales', () => {
  it('cada groupBy coincide con el oráculo (valores, orden, ceros y etiquetas)', async () => {
    await poblar();
    const todas = await crudas();
    for (const tz of [TZ, 0, 330]) {
      for (const g of GRUPOS) {
        const b = await ventas(g, { tzOffsetMin: tz });
        expect(b.groupBy).toBe(g);
        expect(b.items, `${g} tz ${tz}`).toEqual(await ventasO(todas, g, DESDE, HASTA, tz));
      }
    }
  });
  it('subrango: day y hour respetan el rango local', async () => {
    await poblar();
    const todas = await crudas();
    const from = T0 + DIA + 5 * 3_600_000;
    const to = T0 + 3 * DIA + 7 * 3_600_000;
    for (const g of ['day', 'hour', 'terminal'] as const) {
      expect((await ventas(g, { from, to })).items, g).toEqual(await ventasO(todas, g, from, to, TZ));
    }
  });
  it('day y hour incluyen ceros aunque no haya ventas; terminal/cashier/method/brand salen vacíos', async () => {
    const dias = (await ventas('day')).items;
    expect(dias.map((i) => i.key)).toEqual(['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12', '2024-01-13', '2024-01-14', '2024-01-15', '2024-01-16']);
    expect(dias.every((i) => i.sales === 0 && i.totalNet === '0')).toBe(true);
    expect((await ventas('hour')).items).toHaveLength(24);
    for (const g of ['terminal', 'cashier', 'method', 'brand']) expect((await ventas(g)).items, g).toEqual([]);
  });
  it('terminal y cashier llevan el alias y el nombre actuales como label', async () => {
    await inyectar({ amount: '900' });
    expect((await ventas('terminal')).items).toEqual([{ key: TERMINALES[0], label: 'Barra', sales: 1, totalNet: '900' }]);
    expect((await ventas('cashier')).items).toEqual([{ key: 'user-admin', label: 'Admin demo', sales: 1, totalNet: '900' }]);
  });
  it('el cubo del día usa la hora local del desfase', async () => {
    await inyectar({ amount: '10', createdAt: Date.UTC(2024, 0, 10, 2, 59, 59, 999) }); // tz −180 → 2024-01-09 23:59:59.999
    await inyectar({ amount: '20', createdAt: Date.UTC(2024, 0, 10, 3, 0, 0, 0) }); // → 2024-01-10 00:00
    const items = (await ventas('day')).items;
    expect(items.find((i) => i.key === '2024-01-09')).toMatchObject({ sales: 1, totalNet: '10' });
    expect(items.find((i) => i.key === '2024-01-10')).toMatchObject({ sales: 1, totalNet: '20' });
    const horas = (await ventas('hour')).items;
    expect(horas.find((i) => i.key === '23')).toMatchObject({ sales: 1, totalNet: '10' });
    expect(horas.find((i) => i.key === '00')).toMatchObject({ sales: 1, totalNet: '20' });
  });
});

describe('R6 invariantes', () => {
  it('I1 la suma de cada agrupación es el total de summary', async () => {
    await poblar();
    const k = (await resumen()).kpis;
    expect(BigInt(k.totalNet as string)).toBeGreaterThan(0n);
    for (const g of GRUPOS) {
      const items = (await ventas(g)).items;
      expect(items.reduce((s, i) => s + BigInt(i.totalNet), 0n), g).toBe(BigInt(k.totalNet as string));
      expect(items.reduce((s, i) => s + i.sales, 0), g).toBe(k.sales);
    }
  });
  it('I2 los bordes del rango: from y to entran; from−1 y to+1 no', async () => {
    const from = T0, to = T0 + 1000;
    await inyectar({ amount: '1', createdAt: from - 1 });
    await inyectar({ amount: '10', createdAt: from });
    await inyectar({ amount: '100', createdAt: to });
    await inyectar({ amount: '1000', createdAt: to + 1 });
    const k = (await resumen({ from, to })).kpis;
    expect(k).toMatchObject({ totalNet: '110', sales: 2, attempts: 2 });
    expect((await ventas('hour', { from, to })).items.reduce((s, i) => s + i.sales, 0)).toBe(2);
  });
  it('I3 importes de 8 dígitos no pierden exactitud', async () => {
    for (let i = 0; i < 50; i++) await inyectar({ amount: '99999999', createdAt: T0 + i });
    const k = (await resumen()).kpis;
    expect(k).toMatchObject({ totalNet: '4999999950', avgTicket: '99999999', sales: 50 });
    expect((await ventas('method')).items).toEqual([{ key: 'card', label: 'card', sales: 50, totalNet: '4999999950' }]);
  });
  it('I4 los totales de un comercio no cambian por las ventas de otro, y el otro solo ve las suyas', async () => {
    await inyectar({ amount: '1000' });
    const antes = await resumen();
    const ajeno = await comercioAjeno();
    await inyectar({ terminalId: 't-ajeno', cashierId: 'u-ajeno', amount: '777' });
    expect(await resumen()).toEqual(antes);
    const suyo = await resumen({}, ajeno);
    expect(suyo.kpis).toMatchObject({ totalNet: '777', sales: 1, attempts: 1 });
    expect((await ventas('terminal', {}, ajeno)).items).toEqual([{ key: 't-ajeno', label: 'x', sales: 1, totalNet: '777' }]);
    expect((await ventas('cashier', {}, ajeno)).items).toEqual([{ key: 'u-ajeno', label: 'Ajeno', sales: 1, totalNet: '777' }]);
  });
});

describe('R7 sales.csv', () => {
  const csv = (groupBy: string, extra: Record<string, string | number> = {}, headers = admin) =>
    get(`${BASE}/sales.csv${qs({ ...rango, groupBy, ...extra })}`, headers);

  it('cabeceras: text/csv utf-8 y adjunto con el nombre del reporte', async () => {
    const r = await csv('day');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="ventas-day-${DESDE}-${HASTA}.csv"`);
  });
  it('mismos datos que /sales, línea a línea con \\r\\n', async () => {
    await poblar();
    for (const g of GRUPOS) {
      const items = (await ventas(g)).items;
      const esperado = 'key,label,sales,totalNet\r\n' + items.map((i) => `${i.key},${i.label},${i.sales},${i.totalNet}\r\n`).join('');
      expect((await csv(g)).body, g).toBe(esperado);
    }
  });
  it('sin ventas: solo la cabecera (terminal) o los ceros (day)', async () => {
    expect((await csv('terminal')).body).toBe('key,label,sales,totalNet\r\n');
    expect((await csv('hour')).body.split('\r\n')).toHaveLength(26);
  });
  it('un alias con coma, comillas o fórmula sale escapado y neutralizado', async () => {
    h.db.prepare("UPDATE terminals SET alias = ? WHERE id = ?").run('=Bar, "Sur"', TERMINALES[0]);
    h.db.prepare("UPDATE terminals SET alias = ? WHERE id = ?").run('+cmd', TERMINALES[1]);
    await inyectar({ amount: '500' });
    await inyectar({ amount: '300', terminalId: TERMINALES[1] });
    expect((await csv('terminal')).body).toBe(
      'key,label,sales,totalNet\r\n' +
      `${TERMINALES[0]},"'=Bar, ""Sur""",1,500\r\n` +
      `${TERMINALES[1]},'+cmd,1,300\r\n`,
    );
  });
  it('el nombre del cajero también se neutraliza', async () => {
    h.db.prepare("UPDATE users SET name = ? WHERE id = ?").run('@evil', 'user-admin');
    await inyectar({ amount: '500' });
    expect((await csv('cashier')).body).toBe("key,label,sales,totalNet\r\nuser-admin,'@evil,1,500\r\n");
  });
});
