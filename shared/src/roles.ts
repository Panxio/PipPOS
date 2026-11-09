export const ROLES = ['admin', 'supervisor', 'cajero'] as const;
export type Role = (typeof ROLES)[number];

export const SECTIONS = [
  'inicio',
  'terminales',
  'usuarios',
  'transacciones',
  'reportes',
  'alertas',
  'liquidaciones',
] as const;
export type Section = (typeof SECTIONS)[number];
