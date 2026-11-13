import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { codificarCursor, decodificarCursor } from '../src/domain/apikey';
import { parsearCsv } from '../src/domain/terminal-csv';

// Pruebas de propiedades (fuzzing de entradas no confiables): el CSV de importación y el cursor de la API pública.
const NUM_RUNS = 500;

const sinCrNiBom = (s: string): boolean => !s.includes('\r') && !s.includes('﻿');
const campoCsv = fc.string({ unit: fc.constantFrom('a', 'Z', '0', ' ', ',', '"', '\n', 'ñ', ';'), maxLength: 12 }).filter(sinCrNiBom);
const filasCsv = fc
  .array(fc.array(campoCsv, { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 8 })
  // una fila de un solo campo vacío es una línea vacía: el parser la ignora, así que no es una fila «de datos»
  .filter((filas) => !filas.some((f) => f.length === 1 && f[0] === ''));

const aCsv = (filas: string[][]): string =>
  filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

describe('parsearCsv · propiedades', () => {
  it('nunca lanza, para cualquier texto', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (t) => { parsearCsv(t); }), { numRuns: NUM_RUNS });
  });
  it('ida y vuelta: escribir filas entre comillas y volver a leerlas devuelve los mismos campos', () => {
    fc.assert(fc.property(filasCsv, (filas) => {
      expect(parsearCsv(aCsv(filas)).map((f) => f.campos)).toEqual(filas);
    }), { numRuns: NUM_RUNS });
  });
  it('el número de línea de cada registro es 1 + los saltos de línea de los registros anteriores (también dentro de comillas)', () => {
    fc.assert(fc.property(filasCsv, (filas) => {
      let esperada = 1;
      const esperadas = filas.map((f) => {
        const actual = esperada;
        esperada += 1 + f.join('').split('\n').length - 1;
        return actual;
      });
      expect(parsearCsv(aCsv(filas)).map((f) => f.linea)).toEqual(esperadas);
    }), { numRuns: NUM_RUNS });
  });
});

describe('cursor · propiedades', () => {
  it('ida y vuelta: decodificar(codificar(folio)) devuelve el folio', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (n) => {
      expect(decodificarCursor(codificarCursor(n))).toBe(n);
    }), { numRuns: NUM_RUNS });
  });
  it('nunca lanza; si acepta un texto, ese texto es exactamente la codificación canónica del folio', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (t) => {
      const folio = decodificarCursor(t);
      if (folio !== null) expect(codificarCursor(folio)).toBe(t);
    }), { numRuns: NUM_RUNS });
  });
  it('una codificación válida alterada en un carácter no se acepta como el mismo folio', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), fc.nat(), fc.constantFrom('=', '+', '/', '-', '_', ' ', '*'), (n, pos, ch) => {
      const base = codificarCursor(n);
      const i = pos % base.length;
      const alterado = base.slice(0, i) + ch + base.slice(i + 1);
      expect(decodificarCursor(alterado)).not.toBe(n);
    }), { numRuns: NUM_RUNS });
  });
});
