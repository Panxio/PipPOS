import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Lista de términos VERSIONADA con el resultado (spec § 7). Si cambia, cambia aquí y en la spec.
const IMPORTS_PROHIBIDOS_EN_DOMINIO = /from\s+['"](fastify|@fastify\/[^'"]*|node:sqlite|zod|node:crypto|crypto)['"]/;
const RELOJ_Y_AZAR = /Date\.now|new Date\(|Math\.random/;
const IMPORTA_ADAPTADORES = /from\s+['"][^'"]*adapters\//;

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function archivos(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`falta el directorio ${dir}`); // un grep por ausencia no puede dar verde en vacío
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const infracciones = (dir: string, re: RegExp): string[] =>
  archivos(dir).filter((f) => re.test(readFileSync(f, 'utf8')));

describe('el detector detecta (calibración: debe dar rojo sobre código roto)', () => {
  it('reconoce cada patrón prohibido', () => {
    expect(IMPORTS_PROHIBIDOS_EN_DOMINIO.test(`import { z } from 'zod';`)).toBe(true);
    expect(IMPORTS_PROHIBIDOS_EN_DOMINIO.test(`import x from "node:crypto"`)).toBe(true);
    expect(IMPORTS_PROHIBIDOS_EN_DOMINIO.test(`import { Role } from '@pippos/shared';`)).toBe(false);
    expect(RELOJ_Y_AZAR.test('const t = Date.now();')).toBe(true);
    expect(RELOJ_Y_AZAR.test('const d = new Date(5);')).toBe(true);
    expect(RELOJ_Y_AZAR.test('const r = Math.random();')).toBe(true);
    expect(RELOJ_Y_AZAR.test('const t = clock.nowMs();')).toBe(false);
    expect(IMPORTA_ADAPTADORES.test(`import { x } from '../adapters/http/app';`)).toBe(true);
  });
  it('falla si el directorio no existe', () => {
    expect(() => archivos(join(SRC, 'no-existe'))).toThrow(/falta el directorio/);
  });
});

describe('restricciones de arquitectura (S13)', () => {
  it('domain/: sin fastify, node:sqlite, zod ni node:crypto', () => {
    expect(infracciones(join(SRC, 'domain'), IMPORTS_PROHIBIDOS_EN_DOMINIO)).toEqual([]);
  });
  it('domain/ y application/: sin reloj ni azar', () => {
    expect(infracciones(join(SRC, 'domain'), RELOJ_Y_AZAR)).toEqual([]);
    expect(infracciones(join(SRC, 'application'), RELOJ_Y_AZAR)).toEqual([]);
  });
  it('application/ no importa adapters/', () => {
    expect(infracciones(join(SRC, 'application'), IMPORTA_ADAPTADORES)).toEqual([]);
  });
});
