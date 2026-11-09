import { describe, expect, it } from 'vitest';
import { alcancePermite, codificarCursor, decodificarCursor, formatoLlave, prefijoDe } from '../src/domain/apikey';

describe('formatoLlave y prefijoDe (K1)', () => {
  it('la llave es «pip_» + el token y el prefijo son sus 8 primeros caracteres', () => {
    expect(formatoLlave('abcdef123456')).toBe('pip_abcdef123456');
    expect(prefijoDe('pip_abcdef123456')).toBe('pip_abcd');
    expect(prefijoDe(formatoLlave('Zz9-_k'))).toBe('pip_Zz9-');
  });
});

describe('alcancePermite (K3)', () => {
  it('read solo lee; write lee y cobra; nada más', () => {
    expect(alcancePermite('read', 'GET')).toBe(true);
    expect(alcancePermite('read', 'POST')).toBe(false);
    expect(alcancePermite('write', 'GET')).toBe(true);
    expect(alcancePermite('write', 'POST')).toBe(true);
  });
  it('PUT, PATCH y DELETE no los permite ningún alcance', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect(alcancePermite('read', m), `read ${m}`).toBe(false);
      expect(alcancePermite('write', m), `write ${m}`).toBe(false);
    }
  });
});

describe('cursor (K5)', () => {
  it('es el folio en base64url, sin relleno', () => {
    expect(codificarCursor(5)).toBe('NQ');
    expect(codificarCursor(123)).toBe('MTIz');
    expect(codificarCursor(99_999_999)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('ida y vuelta para cualquier folio positivo', () => {
    for (const f of [1, 2, 9, 10, 255, 12_345, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
      expect(decodificarCursor(codificarCursor(f)), String(f)).toBe(f);
    }
  });
  it('lo que no es un folio positivo canónico da null', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    for (const mal of ['', '!!!', 'N Q', 'NQ==', b64('0'), b64('-1'), b64('1.5'), b64('abc'), b64('05'), b64(' 5'), b64('5 '), b64('1e3'), b64('9007199254740993'), b64('')]) {
      expect(decodificarCursor(mal), JSON.stringify(mal)).toBeNull();
    }
  });
});
