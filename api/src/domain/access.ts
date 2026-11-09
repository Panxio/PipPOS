import type { Role, Section } from '@pippos/shared';

// Tabla S11 de la spec: lo que no está listado se deniega.
const SECCIONES_POR_ROL: Record<Role, readonly Section[]> = {
  admin: ['inicio', 'terminales', 'usuarios', 'transacciones', 'reportes', 'alertas', 'liquidaciones'],
  supervisor: ['inicio', 'terminales', 'transacciones', 'reportes', 'alertas'],
  cajero: ['inicio', 'transacciones'],
};

export function sectionsFor(role: Role): readonly Section[] {
  return Object.hasOwn(SECCIONES_POR_ROL, role) ? SECCIONES_POR_ROL[role] : [];
}

export function canAccess(role: Role, section: Section): boolean {
  return sectionsFor(role).includes(section);
}

// S1: los tres roles leen terminales (el cajero necesita elegir uno al cobrar); solo el admin da de alta, edita o importa.
export function puedeLeerTerminales(role: Role): boolean {
  return puedeCobrar(role);
}

export function puedeEscribirTerminales(role: Role): boolean {
  return role === 'admin';
}

// U1: usuarios y bandeja de invitaciones son solo del admin.
export function puedeAdministrarUsuarios(role: Role): boolean {
  return role === 'admin';
}

// B4: crear, listar, revocar y rotar llaves de la API pública es solo del admin.
export function puedeGestionarLlaves(role: Role): boolean {
  return role === 'admin';
}

// U1: el supervisor lee sucursales; crear sucursales y cajas es solo del admin.
export function puedeLeerSucursales(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

export function puedeEscribirSucursales(role: Role): boolean {
  return role === 'admin';
}

// C1: cobrar y leer transacciones: los tres roles. El cajero solo ve las suyas (filtro en la aplicación).
export function puedeCobrar(role: Role): boolean {
  return role === 'admin' || role === 'supervisor' || role === 'cajero';
}

export function puedeLeerTransacciones(role: Role): boolean {
  return puedeCobrar(role);
}

// C1: anular y devolver, solo admin y supervisor.
export function puedeAnularODevolver(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

// C1: admin y supervisor ven todas las transacciones del comercio; el cajero, solo las suyas.
export function veTodasLasTransacciones(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

// R1 (reportería): admin y supervisor leen reportes; el cajero recibe 403.
export function puedeLeerReportes(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

// R5 (A1): alertas y umbrales se leen y se marcan como leídas en admin y supervisor; el cajero recibe 403.
export function puedeVerAlertas(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

// R5 (A1): cambiar umbrales es solo del admin.
export function puedeCambiarUmbrales(role: Role): boolean {
  return role === 'admin';
}

// R5 (A1, A9-A10): la bitácora (lista y CSV) es solo del admin.
export function puedeVerAuditoria(role: Role): boolean {
  return role === 'admin';
}
