import { describe, expect, it } from 'vitest';
import { sembrarTransacciones } from '../src/seed/transacciones';
import { FakeIds } from './helpers/fakes';
import { loginToken, makeApp, withCookie } from './helpers/app';

const AHORA = 1_700_000_000_000;
const DIA = 86_400_000;

interface Fila {
  id: string; folio: number; terminal_id: string; cashier_id: string; amount: number; refunded: number; method: string;
  brand: string; last4: string; status: string; response_code: string | null; auth_code: string | null; created_at_ms: number;
  request_id: string | null;
}

async function sembrada() {
  const h = await makeApp({ seed: true });
  const n = await sembrarTransacciones(h.db, new FakeIds(), AHORA);
  const filas = h.db.prepare('SELECT * FROM transactions ORDER BY folio').all() as unknown as Fila[];
  return { h, n, filas };
}

describe('R8 sembrarTransacciones', () => {
  it('inserta exactamente 400 con folios 1…400 y devuelve cuántas', async () => {
    const { n, filas } = await sembrada();
    expect(n).toBe(400);
    expect(filas).toHaveLength(400);
    expect(filas.map((f) => f.folio)).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
  });
  it('todas caen en los últimos 30 días del reloj', async () => {
    const { filas } = await sembrada();
    for (const f of filas) {
      expect(f.created_at_ms).toBeGreaterThanOrEqual(AHORA - 30 * DIA);
      expect(f.created_at_ms).toBeLessThanOrEqual(AHORA);
    }
  });
  it('hay mezcla: los 6 estados, los 3 terminales sembrados y los 3 usuarios sembrados', async () => {
    const { filas } = await sembrada();
    expect(new Set(filas.map((f) => f.status))).toEqual(
      new Set(['approved', 'declined', 'timeout', 'voided', 'partially_refunded', 'refunded']));
    expect(new Set(filas.map((f) => f.terminal_id))).toEqual(new Set(['term-demo-0001', 'term-demo-0002', 'term-demo-0003']));
    expect(new Set(filas.map((f) => f.cashier_id))).toEqual(new Set(['user-admin', 'user-supervisor', 'user-cajero']));
    expect(new Set(filas.map((f) => f.method)).size).toBe(2);
    expect(new Set(filas.map((f) => f.brand)).size).toBe(3);
  });
  it('la mayoría son aprobadas (un comercio sano) y los importes son válidos', async () => {
    const { filas } = await sembrada();
    expect(filas.filter((f) => f.status === 'approved').length).toBeGreaterThan(200);
    for (const f of filas) {
      expect(f.amount).toBeGreaterThanOrEqual(1);
      expect(f.amount).toBeLessThanOrEqual(99_999_999);
      expect(f.refunded).toBeGreaterThanOrEqual(0);
      expect(f.refunded).toBeLessThanOrEqual(f.amount);
      expect(f.last4).toMatch(/^[0-9]{4}$/);
    }
  });
  it('devoluciones y códigos coherentes con el estado (como C4)', async () => {
    const { filas } = await sembrada();
    for (const f of filas) {
      if (f.status === 'refunded') expect(f.refunded, `folio ${f.folio}`).toBe(f.amount);
      if (f.status === 'partially_refunded') {
        expect(f.refunded).toBeGreaterThan(0);
        expect(f.refunded).toBeLessThan(f.amount);
      }
      if (f.status === 'approved' || f.status === 'voided') expect(f.refunded).toBe(0);
      if (f.status === 'declined') { expect(['51', '05']).toContain(f.response_code); expect(f.auth_code).toBeNull(); }
      if (f.status === 'timeout') { expect(f.response_code).toBeNull(); expect(f.auth_code).toBeNull(); }
      if (!['declined', 'timeout'].includes(f.status)) { expect(f.response_code).toBe('00'); expect(f.auth_code).toMatch(/^[0-9]{6}$/); }
    }
  });
  it('un evento created por transacción, más voided/refunded donde corresponde', async () => {
    const { h, filas } = await sembrada();
    const eventos = h.db.prepare('SELECT transaction_id, kind, amount FROM transaction_events').all() as Array<{ transaction_id: string; kind: string; amount: number }>;
    for (const f of filas) {
      const propios = eventos.filter((e) => e.transaction_id === f.id);
      expect(propios.filter((e) => e.kind === 'created'), `folio ${f.folio}`).toHaveLength(1);
      expect(propios.filter((e) => e.kind === 'voided')).toHaveLength(f.status === 'voided' ? 1 : 0);
      const devuelto = propios.filter((e) => e.kind === 'refunded').reduce((s, e) => s + e.amount, 0);
      expect(devuelto, `folio ${f.folio}`).toBe(f.refunded);
    }
  });
  it('es determinista: dos BD sembradas con el mismo reloj quedan idénticas', async () => {
    const a = await sembrada();
    const b = await sembrada();
    expect(b.filas).toEqual(a.filas);
  });
  it('depende del reloj: otro "ahora" desplaza las fechas, no la forma', async () => {
    const h = await makeApp({ seed: true });
    await sembrarTransacciones(h.db, new FakeIds(), AHORA + 10 * DIA);
    const filas = h.db.prepare('SELECT status, amount, created_at_ms FROM transactions ORDER BY folio').all() as unknown as Fila[];
    expect(Math.min(...filas.map((f) => f.created_at_ms))).toBeGreaterThanOrEqual(AHORA + 10 * DIA - 30 * DIA);
    expect(filas).toHaveLength(400);
  });
  it('con transacciones ya presentes devuelve 0 y no toca nada', async () => {
    const { h, filas } = await sembrada();
    expect(await sembrarTransacciones(h.db, new FakeIds(), AHORA)).toBe(0);
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 400 });
    expect(h.db.prepare('SELECT * FROM transactions ORDER BY folio').all()).toEqual(filas);
  });
  it('una BD recién sembrada con seedDemo no trae transacciones (buildApp y los tests no las ven)', async () => {
    const h = await makeApp({ seed: true });
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 0 });
  });
  it('lo sembrado se ve en los reportes y suma lo mismo que el feed', async () => {
    const { h } = await sembrada();
    const admin = withCookie(await loginToken(h, 'admin'));
    const from = AHORA - 31 * DIA, to = AHORA;
    const r = await h.app.inject({ method: 'GET', url: `/api/v1/reports/summary?from=${from}&to=${to}&tzOffsetMin=-180`, headers: admin });
    expect(r.statusCode).toBe(200);
    const k = (r.json() as { kpis: { attempts: number; sales: number; totalNet: string } }).kpis;
    expect(k.attempts).toBe(400);
    expect(k.sales).toBeGreaterThan(200);
    expect(BigInt(k.totalNet)).toBeGreaterThan(0n);
  });
});
