import { describe, expect, it } from 'vitest';
import { ERROR_CODES, LoginRequestSchema, PreferencesSchema, ROLES, SECTIONS } from '../src/index';

describe('roles, secciones y códigos de error', () => {
  it('ROLES es admin, supervisor, cajero (en ese orden)', () => {
    expect([...ROLES]).toEqual(['admin', 'supervisor', 'cajero']);
  });
  it('SECTIONS son las 7 de la spec (en ese orden)', () => {
    expect([...SECTIONS]).toEqual([
      'inicio', 'terminales', 'usuarios', 'transacciones', 'reportes', 'alertas', 'liquidaciones',
    ]);
  });
  it('ERROR_CODES contiene los 10 códigos tipados (CONFLICT lo añade R1, ACCOUNT_LOCKED R2)', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      ['ACCOUNT_LOCKED', 'CONFLICT', 'FORBIDDEN', 'INTERNAL_ERROR', 'INVALID_CREDENTIALS', 'NOT_FOUND', 'ORIGIN_NOT_ALLOWED',
        'RATE_LIMITED', 'UNAUTHENTICATED', 'VALIDATION_ERROR'],
    );
  });
});

describe('LoginRequestSchema (S4)', () => {
  it('normaliza el email: trim y minúsculas', () => {
    const r = LoginRequestSchema.parse({ email: '  ADMIN@Pippos.test ', password: 'x' });
    expect(r.email).toBe('admin@pippos.test');
  });
  it('rechaza un campo extra (mass assignment)', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.cl', password: 'x', role: 'admin' }).success).toBe(false);
  });
  it('acepta 256 caracteres de contraseña y rechaza 257', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.cl', password: 'x'.repeat(256) }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ email: 'a@b.cl', password: 'x'.repeat(257) }).success).toBe(false);
  });
  it('rechaza contraseña vacía, email inválido y tipos malos', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.cl', password: '' }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: 'no-es-email', password: 'x' }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: 'a@b.cl', password: 123 }).success).toBe(false);
  });
});

describe('PreferencesSchema (S12)', () => {
  it('acepta es/en y light/dark', () => {
    for (const language of ['es', 'en']) for (const theme of ['light', 'dark']) {
      expect(PreferencesSchema.safeParse({ language, theme }).success).toBe(true);
    }
  });
  it('rechaza valores fuera de rango, faltantes y campos extra', () => {
    expect(PreferencesSchema.safeParse({ language: 'fr', theme: 'dark' }).success).toBe(false);
    expect(PreferencesSchema.safeParse({ language: 'es', theme: 'blue' }).success).toBe(false);
    expect(PreferencesSchema.safeParse({ language: 'es' }).success).toBe(false);
    expect(PreferencesSchema.safeParse({ language: 'es', theme: 'dark', role: 'admin' }).success).toBe(false);
  });
});
