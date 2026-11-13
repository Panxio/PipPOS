import { describe, expect, it } from 'vitest';
import { CABECERA_IMPORTACION, MAX_FILAS_IMPORTACION, filasDeImportacion, parsearCsv } from '../src/domain/terminal-csv';

const CAB = CABECERA_IMPORTACION.join(',');
const campos = (texto: string) => parsearCsv(texto).map((f) => f.campos);
const lineas = (texto: string) => parsearCsv(texto).map((f) => f.linea);

describe('parsearCsv', () => {
  it('separa por comas y filas por salto de línea; el número de línea empieza en 1', () => {
    expect(parsearCsv('a,b\n1,2\n')).toEqual([{ linea: 1, campos: ['a', 'b'] }, { linea: 2, campos: ['1', '2'] }]);
  });
  it('CRLF equivale a LF, y el BOM inicial se ignora', () => {
    expect(parsearCsv('a,b\r\n1,2\r\n')).toEqual(parsearCsv('a,b\n1,2\n'));
    expect(campos('﻿a,b\n')).toEqual([['a', 'b']]);
  });
  it('sin salto final la última fila cuenta; campos vacíos se conservan', () => {
    expect(campos('a,b')).toEqual([['a', 'b']]);
    expect(campos('a,')).toEqual([['a', '']]);
    expect(campos(',b')).toEqual([['', 'b']]);
    expect(campos('x,,z')).toEqual([['x', '', 'z']]);
  });
  it('texto vacío: sin filas; las líneas vacías del final se ignoran, las del medio no', () => {
    expect(parsearCsv('')).toEqual([]);
    expect(campos('a\n\n\n')).toEqual([['a']]);
    expect(parsearCsv('a\n\nb')).toEqual([{ linea: 1, campos: ['a'] }, { linea: 2, campos: [''] }, { linea: 3, campos: ['b'] }]);
  });
  it('comillas: protegen comas y saltos; «""» es una comilla; el cierre no deja residuo', () => {
    expect(campos('a,"b,c"\n')).toEqual([['a', 'b,c']]);
    expect(campos('"he said ""hi"""')).toEqual([['he said "hi"']]);
    expect(campos('"a"')).toEqual([['a']]);
    expect(campos('"x",y')).toEqual([['x', 'y']]);
    expect(campos('"",z')).toEqual([['', 'z']]);
  });
  it('una comilla en medio de un campo no abre cita', () => {
    expect(campos('ab"c,d')).toEqual([['ab"c', 'd']]);
    expect(campos('a,b"c\nd')).toEqual([['a', 'b"c'], ['d']]);
  });
  it('un salto dentro de comillas suma línea; el número de cada fila es el de su inicio', () => {
    expect(parsearCsv('x,"l1\nl2"\ny,z\n')).toEqual([{ linea: 1, campos: ['x', 'l1\nl2'] }, { linea: 3, campos: ['y', 'z'] }]);
    expect(lineas('a\nb\nc')).toEqual([1, 2, 3]);
  });
});

describe('filasDeImportacion', () => {
  const fila = 'TERM-0300,Alias,PAX A920,Centro,Caja 3';
  it('devuelve solo las filas de datos, con su número de línea', () => {
    expect(filasDeImportacion(`${CAB}\n${fila}\n`)).toEqual([{ linea: 2, campos: fila.split(',') }]);
    expect(filasDeImportacion(`${CAB}\n`)).toEqual([]);
  });
  it('null si no hay cabecera o no es exactamente la esperada (nombres, orden y cantidad)', () => {
    for (const mala of ['', 'serial,alias', `${CAB},extra`, 'alias,serial,model,branch,till', 'serial,alias,model,branch,caja', 'Serial,alias,model,branch,till']) {
      expect(filasDeImportacion(`${mala}\n${fila}\n`), JSON.stringify(mala)).toBeNull();
    }
  });
  it(`acepta hasta ${MAX_FILAS_IMPORTACION} filas de datos y rechaza una más`, () => {
    const datos = (n: number) => Array.from({ length: n }, (_, i) => `TERM-${i},a,b,c,d`).join('\n');
    expect(filasDeImportacion(`${CAB}\n${datos(MAX_FILAS_IMPORTACION)}\n`)).toHaveLength(MAX_FILAS_IMPORTACION);
    expect(filasDeImportacion(`${CAB}\n${datos(MAX_FILAS_IMPORTACION + 1)}\n`)).toBeNull();
  });
});
