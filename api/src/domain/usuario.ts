import type { Role, UserStatus } from '@pippos/shared';

// Estado derivado (U3): desactivado gana; sin contraseña fijada está invitado; si no, activo.
export function estadoDeUsuario(usuario: { active: boolean; passwordHash: string }): UserStatus {
  if (!usuario.active) return 'inactive';
  return usuario.passwordHash === '' ? 'invited' : 'active';
}

// Un cajero trabaja en una sucursal: sin ella no es una combinación válida (U4, U8).
export function sucursalValida(role: Role, branchId: string | null): boolean {
  return role !== 'cajero' || branchId !== null;
}
