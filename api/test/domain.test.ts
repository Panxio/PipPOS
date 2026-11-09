import { ROLES, SECTIONS, type Role, type Section } from '@pippos/shared';
import { describe, expect, it } from 'vitest';
import { canAccess, sectionsFor } from '../src/domain/access';
import { SESSION_TTL_MS, isSessionActive } from '../src/domain/session';

describe('secciones por rol (S11)', () => {
  it('admin ve las 7', () => expect([...sectionsFor('admin')]).toEqual([...SECTIONS]));
  it('supervisor ve 5', () => expect([...sectionsFor('supervisor')]).toEqual(
    ['inicio', 'terminales', 'transacciones', 'reportes', 'alertas']));
  it('cajero ve 2', () => expect([...sectionsFor('cajero')]).toEqual(['inicio', 'transacciones']));
  it('canAccess es coherente con sectionsFor en las 21 combinaciones', () => {
    for (const r of ROLES) for (const s of SECTIONS) {
      expect(canAccess(r, s)).toBe(sectionsFor(r).includes(s));
    }
  });
  it('casos concretos de denegación y permiso', () => {
    expect(canAccess('cajero', 'usuarios')).toBe(false);
    expect(canAccess('supervisor', 'liquidaciones')).toBe(false);
    expect(canAccess('admin', 'liquidaciones')).toBe(true);
    expect(canAccess('cajero', 'inicio')).toBe(true);
  });
  it('deniega por defecto un rol o sección desconocidos', () => {
    expect([...sectionsFor('intruso' as Role)]).toEqual([]);
    expect(canAccess('intruso' as Role, 'inicio')).toBe(false);
    expect(canAccess('admin', 'secreta' as Section)).toBe(false);
  });
});

describe('vigencia de la sesión (S6)', () => {
  it('el TTL es de 8 horas', () => expect(SESSION_TTL_MS).toBe(28_800_000));
  it('activa estrictamente antes de vencer', () => {
    expect(isSessionActive(1000, 999)).toBe(true);
    expect(isSessionActive(1000, 1000)).toBe(false);
    expect(isSessionActive(1000, 1001)).toBe(false);
  });
});
