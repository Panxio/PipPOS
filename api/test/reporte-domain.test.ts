import { describe, expect, it } from 'vitest';
import {
  aCsv, agruparPor, claveDia, claveHora, esVenta, kpis, neto, periodoAnterior, type FilaVenta,
} from '../src/domain/reporte';

const DIA = 86_400_000;
const NOMBRES = { terminal: { t1: 'Barra', t2: 'Terraza' }, cashier: { c1: 'Ana', c2: 'Beto' } };

const fila = (over: Partial<FilaVenta> = {}): FilaVenta => ({
  createdAtMs: 0, terminalId: 't1', cashierId: 'c1', amount: 1000n, refunded: 0n, method: 'card', brand: 'visa',
  status: 'approved', ...over,
});

describe('R3 esVenta y neto', () => {
  it('son ventas approved, partially_refunded y refunded; el resto no', () => {
    for (const s of ['approved', 'partially_refunded', 'refunded'] as const) expect(esVenta(s), s).toBe(true);
    for (const s of ['declined', 'timeout', 'voided'] as const) expect(esVenta(s), s).toBe(false);
  });
  it('neto = amount − refunded', () => {
    expect(neto(5000n, 2000n)).toBe(3000n);
    expect(neto(400n, 400n)).toBe(0n);
    expect(neto(99_999_999n, 0n)).toBe(99_999_999n);
  });
});

describe('R4 kpis', () => {
  const filas = [
    fila({ amount: 1000n }),
    fila({ amount: 5000n, refunded: 2000n, status: 'partially_refunded' }),
    fila({ amount: 400n, refunded: 400n, status: 'refunded' }),
    fila({ amount: 700n, status: 'voided' }),
    fila({ amount: 300n, status: 'declined' }),
    fila({ amount: 200n, status: 'timeout' }),
    fila({ amount: 2001n }),
  ];
  it('totales, ticket promedio truncado y aprobación en puntos base truncados', () => {
    expect(kpis(filas)).toEqual({
      totalNet: 6001n, sales: 4, avgTicket: 1500n, attempts: 7, approvalBp: 7142, voidedCount: 1, voidedAmount: 700n,
    });
  });
  it('sin filas todo es cero (sin dividir por cero)', () => {
    expect(kpis([])).toEqual({
      totalNet: 0n, sales: 0, avgTicket: 0n, attempts: 0, approvalBp: 0, voidedCount: 0, voidedAmount: 0n,
    });
  });
  it('solo rechazos: hay intentos, 0 ventas, ticket 0 y aprobación 0', () => {
    const k = kpis([fila({ status: 'declined' }), fila({ status: 'timeout' })]);
    expect(k).toMatchObject({ sales: 0, attempts: 2, avgTicket: 0n, approvalBp: 0, totalNet: 0n });
  });
  it('2 de 3 aprobadas = 6666 (se trunca, no se redondea)', () => {
    const k = kpis([fila(), fila(), fila({ status: 'declined' })]);
    expect(k.approvalBp).toBe(6666);
  });
  it('todas aprobadas = 10000; una anulada cuenta como aprobada de origen', () => {
    expect(kpis([fila(), fila()]).approvalBp).toBe(10_000);
    expect(kpis([fila(), fila({ status: 'voided' })]).approvalBp).toBe(10_000);
  });
  it('una venta devuelta por completo suma 1 venta de neto 0 y baja el ticket', () => {
    const k = kpis([fila({ amount: 1000n }), fila({ amount: 1000n, refunded: 1000n, status: 'refunded' })]);
    expect(k).toMatchObject({ sales: 2, totalNet: 1000n, avgTicket: 500n });
  });
  it('I3 no pierde exactitud más allá de 2^53', () => {
    const grande = 9_007_199_254_740_993n; // 2^53 + 1
    const k = kpis([fila({ amount: grande }), fila({ amount: grande }), fila({ amount: grande })]);
    expect(k.totalNet).toBe(3n * grande);
    expect(k.avgTicket).toBe(grande);
  });
});

describe('R4 periodoAnterior', () => {
  it('es el período inmediatamente anterior de igual largo', () => {
    expect(periodoAnterior(1000, 1999)).toEqual({ from: 0, to: 999 });
    expect(periodoAnterior(100, 100)).toEqual({ from: 99, to: 99 });
    expect(periodoAnterior(7 * DIA, 14 * DIA - 1)).toEqual({ from: 0, to: 7 * DIA - 1 });
  });
});

describe('R5 claveDia y claveHora (desfase fijo en minutos al este de UTC)', () => {
  it('tz 0 coincide con UTC', () => {
    expect(claveDia(0, 0)).toBe('1970-01-01');
    expect(claveHora(0, 0)).toBe('00');
    expect(claveDia(1_700_000_000_000, 0)).toBe('2023-11-14');
    expect(claveHora(1_700_000_000_000, 0)).toBe('22');
  });
  it('desfase negativo retrocede el día y positivo lo adelanta', () => {
    expect(claveDia(0, -180)).toBe('1969-12-31');
    expect(claveHora(0, -180)).toBe('21');
    expect(claveDia(1_700_000_000_000, -180)).toBe('2023-11-14');
    expect(claveHora(1_700_000_000_000, -180)).toBe('19');
    expect(claveDia(1_700_000_000_000, 240)).toBe('2023-11-15');
    expect(claveHora(1_700_000_000_000, 240)).toBe('02');
  });
  it('desfases que no son horas enteras', () => {
    expect(claveHora(Date.UTC(2024, 0, 1, 0, 0, 0), 330)).toBe('05'); // +05:30
    expect(claveHora(Date.UTC(2024, 0, 1, 18, 29, 59, 999), 330)).toBe('23');
    expect(claveDia(Date.UTC(2024, 0, 1, 18, 29, 59, 999), 330)).toBe('2024-01-01');
    expect(claveDia(Date.UTC(2024, 0, 1, 18, 30, 0, 0), 330)).toBe('2024-01-02');
  });
  it('bordes de día, mes, año y bisiesto, contra el cálculo de Date', () => {
    const casos = [
      Date.UTC(2024, 1, 29), Date.UTC(2024, 1, 29) - 1, Date.UTC(2024, 2, 1), Date.UTC(2023, 1, 28, 23, 59, 59, 999),
      Date.UTC(2023, 2, 1), Date.UTC(2023, 11, 31, 23, 59, 59, 999), Date.UTC(2024, 0, 1), Date.UTC(2100, 1, 28, 23),
      Date.UTC(2100, 2, 1), Date.UTC(2000, 1, 29, 12), Date.UTC(1969, 11, 31, 23, 59, 59, 999), -DIA * 400,
    ];
    for (const ms of casos) {
      for (const tz of [-720, -240, -180, 0, 60, 330, 840]) {
        const iso = new Date(ms + tz * 60_000).toISOString();
        expect(claveDia(ms, tz), `${iso} tz ${tz}`).toBe(iso.slice(0, 10));
        expect(claveHora(ms, tz), `${iso} tz ${tz}`).toBe(iso.slice(11, 13));
      }
    }
  });
});

describe('R5 agruparPor', () => {
  const rango = { from: Date.UTC(2024, 0, 1), to: Date.UTC(2024, 0, 3, 23, 59, 59, 999) };
  const filas = [
    fila({ createdAtMs: Date.UTC(2024, 0, 1, 10), amount: 1000n }),
    fila({ createdAtMs: Date.UTC(2024, 0, 1, 23, 59, 59, 999), amount: 500n, terminalId: 't2', method: 'wallet' }),
    fila({ createdAtMs: Date.UTC(2024, 0, 3, 0), amount: 700n, cashierId: 'c2', brand: 'amex' }),
    fila({ createdAtMs: Date.UTC(2024, 0, 2, 12), amount: 300n, status: 'declined' }),
    fila({ createdAtMs: Date.UTC(2024, 0, 2, 13), amount: 900n, status: 'voided' }),
  ];
  const agrupar = (g: Parameters<typeof agruparPor>[1], tz = 0, f = filas, r = rango) => agruparPor(f, g, tz, r, NOMBRES);

  it('day: todos los días del rango (con ceros), en orden cronológico, solo ventas', () => {
    expect(agrupar('day')).toEqual([
      { key: '2024-01-01', label: '2024-01-01', sales: 2, totalNet: 1500n },
      { key: '2024-01-02', label: '2024-01-02', sales: 0, totalNet: 0n },
      { key: '2024-01-03', label: '2024-01-03', sales: 1, totalNet: 700n },
    ]);
  });
  it('day con desfase: el rango y los cubos son locales', () => {
    const r = { from: Date.UTC(2024, 0, 1, 3), to: Date.UTC(2024, 0, 3, 2, 59, 59, 999) }; // local 01-01 00:00 … 01-02 23:59:59.999
    const f = [
      fila({ createdAtMs: Date.UTC(2024, 0, 1, 3), amount: 10n }),
      fila({ createdAtMs: Date.UTC(2024, 0, 3, 2, 59, 59, 999), amount: 20n }),
    ];
    expect(agrupar('day', -180, f, r)).toEqual([
      { key: '2024-01-01', label: '2024-01-01', sales: 1, totalNet: 10n },
      { key: '2024-01-02', label: '2024-01-02', sales: 1, totalNet: 20n },
    ]);
  });
  it('day de un solo día y de rango largo', () => {
    expect(agrupar('day', 0, [], { from: Date.UTC(2024, 1, 28), to: Date.UTC(2024, 2, 1, 23) }).map((i) => i.key))
      .toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(agrupar('day', 0, [], { from: 5, to: 5 })).toEqual([{ key: '1970-01-01', label: '1970-01-01', sales: 0, totalNet: 0n }]);
  });
  it('hour: siempre las 24 horas locales con ceros, agregadas sobre el rango', () => {
    const items = agrupar('hour');
    expect(items.map((i) => i.key)).toEqual(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')));
    expect(items.find((i) => i.key === '10')).toEqual({ key: '10', label: '10', sales: 1, totalNet: 1000n });
    expect(items.find((i) => i.key === '23')).toEqual({ key: '23', label: '23', sales: 1, totalNet: 500n });
    expect(items.find((i) => i.key === '00')).toEqual({ key: '00', label: '00', sales: 1, totalNet: 700n });
    expect(items.reduce((s, i) => s + i.sales, 0)).toBe(3);
    expect(agrupar('hour', 0, [])).toHaveLength(24);
  });
  it('terminal y cashier: solo con ventas, por total desc y luego key, con el nombre como label', () => {
    expect(agrupar('terminal')).toEqual([
      { key: 't1', label: 'Barra', sales: 2, totalNet: 1700n },
      { key: 't2', label: 'Terraza', sales: 1, totalNet: 500n },
    ]);
    expect(agrupar('cashier')).toEqual([
      { key: 'c1', label: 'Ana', sales: 2, totalNet: 1500n },
      { key: 'c2', label: 'Beto', sales: 1, totalNet: 700n },
    ]);
  });
  it('terminal desconocido: label vacío; empate de total: orden por key', () => {
    const f = [fila({ terminalId: 'zeta', amount: 100n }), fila({ terminalId: 'alfa', amount: 100n }), fila({ terminalId: 't1', amount: 100n })];
    expect(agrupar('terminal', 0, f).map((i) => [i.key, i.label])).toEqual([['alfa', ''], ['t1', 'Barra'], ['zeta', '']]);
  });
  it('method y brand: key del enum como label, solo los que tienen ventas', () => {
    expect(agrupar('method')).toEqual([
      { key: 'card', label: 'card', sales: 2, totalNet: 1700n },
      { key: 'wallet', label: 'wallet', sales: 1, totalNet: 500n },
    ]);
    expect(agrupar('brand')).toEqual([
      { key: 'visa', label: 'visa', sales: 2, totalNet: 1500n },
      { key: 'amex', label: 'amex', sales: 1, totalNet: 700n },
    ]);
  });
  it('usa el neto: una devolución parcial resta del grupo', () => {
    const f = [fila({ amount: 1000n, refunded: 300n, status: 'partially_refunded' }), fila({ amount: 50n, refunded: 50n, status: 'refunded' })];
    expect(agrupar('method', 0, f)).toEqual([{ key: 'card', label: 'card', sales: 2, totalNet: 700n }]);
  });
  it('I1 la suma de cada agrupación es igual al total de kpis', () => {
    const k = kpis(filas);
    for (const g of ['day', 'hour', 'terminal', 'cashier', 'method', 'brand'] as const) {
      const items = agrupar(g);
      expect(items.reduce((s, i) => s + i.totalNet, 0n), g).toBe(k.totalNet);
      expect(items.reduce((s, i) => s + i.sales, 0), g).toBe(k.sales);
    }
  });
});

describe('R7 aCsv', () => {
  const item = (over: Partial<{ key: string; label: string; sales: number; totalNet: bigint }> = {}) =>
    ({ key: 'k', label: 'etiqueta', sales: 1, totalNet: 10n, ...over });

  it('cabecera y cada línea terminan en \\r\\n', () => {
    expect(aCsv([])).toBe('key,label,sales,totalNet\r\n');
    expect(aCsv([item({ key: 'a', label: 'Barra', sales: 2, totalNet: 1500n }), item()])).toBe(
      'key,label,sales,totalNet\r\na,Barra,2,1500\r\nk,etiqueta,1,10\r\n',
    );
  });
  it('comillas RFC 4180 si hay coma, comilla o salto de línea (la comilla se duplica)', () => {
    expect(aCsv([item({ label: 'Bar, Sur' })])).toContain('\r\nk,"Bar, Sur",1,10\r\n');
    expect(aCsv([item({ label: 'dice "hola"' })])).toContain('\r\nk,"dice ""hola""",1,10\r\n');
    expect(aCsv([item({ label: 'a\nb' })])).toContain('\r\nk,"a\nb",1,10\r\n');
    expect(aCsv([item({ key: 'a,b' })])).toContain('\r\n"a,b",etiqueta,1,10\r\n');
  });
  it('antídoto de inyección: =, +, -, @, tab y retorno al inicio llevan un apóstrofe delante (key y label)', () => {
    for (const c of ['=', '+', '-', '@']) {
      expect(aCsv([item({ label: `${c}SUMA(A1)` })]), c).toContain(`\r\nk,'${c}SUMA(A1),1,10\r\n`);
      expect(aCsv([item({ key: `${c}x` })]), c).toContain(`\r\n'${c}x,etiqueta,1,10\r\n`);
    }
    expect(aCsv([item({ label: '\tx' })])).toContain("\r\nk,'\tx,1,10\r\n");
    expect(aCsv([item({ label: '\rx' })])).toContain("\r\nk,\"'\rx\",1,10\r\n");
  });
  it('el antídoto solo actúa al inicio y se combina con las comillas', () => {
    expect(aCsv([item({ label: 'a=b' })])).toContain('\r\nk,a=b,1,10\r\n');
    expect(aCsv([item({ label: ' =x' })])).toContain('\r\nk, =x,1,10\r\n');
    expect(aCsv([item({ label: '=1,2' })])).toContain('\r\nk,"\'=1,2",1,10\r\n');
    expect(aCsv([item({ label: '' })])).toContain('\r\nk,,1,10\r\n');
  });
  it('las claves de día (2024-01-01) no se tocan', () => {
    expect(aCsv([item({ key: '2024-01-01', label: '2024-01-01' })])).toContain('\r\n2024-01-01,2024-01-01,1,10\r\n');
  });
});
