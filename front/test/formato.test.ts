import { describe, expect, it } from 'vitest';
import { formatoBp, formatoClp, formatoVariacion } from '../src/formato';

describe('F21 formatoClp (importes como texto, sin pasar por number)', () => {
  it('agrupa de a tres con punto y antepone $', () => {
    expect(formatoClp('0')).toBe('$0');
    expect(formatoClp('500')).toBe('$500');
    expect(formatoClp('1000')).toBe('$1.000');
    expect(formatoClp('1234567')).toBe('$1.234.567');
    expect(formatoClp('99999999')).toBe('$99.999.999');
  });
});

describe('F35 formatoBp (puntos base como porcentaje con 2 decimales)', () => {
  it('convierte con coma decimal', () => {
    expect(formatoBp(0)).toBe('0,00 %');
    expect(formatoBp(5)).toBe('0,05 %');
    expect(formatoBp(50)).toBe('0,50 %');
    expect(formatoBp(8750)).toBe('87,50 %');
    expect(formatoBp(9999)).toBe('99,99 %');
    expect(formatoBp(10000)).toBe('100,00 %');
  });
});

describe('F35 formatoVariacion (BigInt, un decimal truncado hacia cero)', () => {
  it('signo + si sube, - si baja y sin signo si es cero', () => {
    expect(formatoVariacion('1250', '1000')).toBe('+25,0 %');
    expect(formatoVariacion('900', '1000')).toBe('-10,0 %');
    expect(formatoVariacion('1000', '1000')).toBe('0,0 %');
    expect(formatoVariacion('1001', '1000')).toBe('+0,1 %');
    expect(formatoVariacion('999', '1000')).toBe('-0,1 %');
  });

  it('trunca hacia cero y un cambio menor a 0,1 % queda en «0,0 %» sin signo', () => {
    expect(formatoVariacion('4', '3')).toBe('+33,3 %');
    expect(formatoVariacion('1', '3')).toBe('-66,6 %');
    expect(formatoVariacion('9999', '10000')).toBe('0,0 %');
    expect(formatoVariacion('10001', '10000')).toBe('0,0 %');
  });

  it('con anterior 0 no hay variación: «—»', () => {
    expect(formatoVariacion('5', '0')).toBe('—');
    expect(formatoVariacion('0', '0')).toBe('—');
  });

  it('no pierde exactitud con importes fuera del rango seguro de number', () => {
    expect(formatoVariacion('99999999999999999', '50000000000000000')).toBe('+99,9 %');
    expect(formatoVariacion('9007199254740993', '9007199254740992')).toBe('0,0 %');
    expect(formatoVariacion('18014398509481986', '9007199254740993')).toBe('+100,0 %');
  });
});
