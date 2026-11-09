import { describe, expect, it } from 'vitest';
import { calcularDevolucion, parseMonto, puedeAnular, respuestaDelSwitch } from '../src/domain/transaccion';

const HORA = 3_600_000;

describe('C3 respuestaDelSwitch', () => {
  it('decide solo por last4', () => {
    expect(respuestaDelSwitch('0051')).toEqual({ resultado: 'declined', codigo: '51' });
    expect(respuestaDelSwitch('0005')).toEqual({ resultado: 'declined', codigo: '05' });
    expect(respuestaDelSwitch('0408')).toEqual({ resultado: 'timeout' });
  });
  it('cualquier otro last4 se aprueba (incluidos vecinos de los especiales)', () => {
    for (const l of ['4242', '0000', '0050', '0052', '0004', '0006', '0407', '0409', '5100', '9999']) {
      expect(respuestaDelSwitch(l)).toEqual({ resultado: 'approved' });
    }
  });
});

describe('C2 parseMonto', () => {
  it('acepta enteros positivos de 1 a 99 999 999 como bigint', () => {
    expect(parseMonto('1')).toBe(1n);
    expect(parseMonto('12500')).toBe(12500n);
    expect(parseMonto('99999999')).toBe(99_999_999n);
  });
  it('rechaza lo demás con null', () => {
    for (const m of ['0', '00', '01', '-5', '+5', '1.5', '1,5', ' 5', '5 ', '', 'abc', '1e3', '100000000', '999999999999']) {
      expect(parseMonto(m), m).toBeNull();
    }
  });
});

describe('C8 puedeAnular', () => {
  const creado = 1_000_000;
  it('solo si está approved, sin devoluciones y con menos de 24 h', () => {
    expect(puedeAnular('approved', 0n, creado, creado)).toBe(true);
    expect(puedeAnular('approved', 0n, creado, creado + 24 * HORA - 1)).toBe(true);
  });
  it('a las 24 h exactas ya no', () => {
    expect(puedeAnular('approved', 0n, creado, creado + 24 * HORA)).toBe(false);
    expect(puedeAnular('approved', 0n, creado, creado + 25 * HORA)).toBe(false);
  });
  it('con devoluciones o en otro estado, no', () => {
    expect(puedeAnular('approved', 1n, creado, creado)).toBe(false);
    for (const e of ['declined', 'timeout', 'voided', 'partially_refunded', 'refunded'] as const) {
      expect(puedeAnular(e, 0n, creado, creado), e).toBe(false);
    }
  });
});

describe('C8/C9 calcularDevolucion', () => {
  it('devolución parcial → partially_refunded y acumula', () => {
    expect(calcularDevolucion('approved', 12500n, 0n, 5000n)).toEqual({ ok: true, estado: 'partially_refunded', devuelto: 5000n });
    expect(calcularDevolucion('partially_refunded', 12500n, 5000n, 2500n)).toEqual({ ok: true, estado: 'partially_refunded', devuelto: 7500n });
  });
  it('completar lo que queda → refunded', () => {
    expect(calcularDevolucion('approved', 12500n, 0n, 12500n)).toEqual({ ok: true, estado: 'refunded', devuelto: 12500n });
    expect(calcularDevolucion('partially_refunded', 12500n, 5000n, 7500n)).toEqual({ ok: true, estado: 'refunded', devuelto: 12500n });
  });
  it('pasarse en 1 por encima de lo que queda, no (I1)', () => {
    expect(calcularDevolucion('approved', 12500n, 0n, 12501n)).toEqual({ ok: false });
    expect(calcularDevolucion('partially_refunded', 12500n, 5000n, 7501n)).toEqual({ ok: false });
  });
  it('monto pedido 0 o negativo, no', () => {
    expect(calcularDevolucion('approved', 12500n, 0n, 0n)).toEqual({ ok: false });
    expect(calcularDevolucion('approved', 12500n, 0n, -1n)).toEqual({ ok: false });
  });
  it('otros estados no admiten devolución (I4)', () => {
    for (const e of ['declined', 'timeout', 'voided', 'refunded'] as const) {
      expect(calcularDevolucion(e, 12500n, 0n, 1n), e).toEqual({ ok: false });
    }
  });
});
