export const VIGENCIA_INVITACION_MS = 48 * 60 * 60 * 1000;

// La invitación nace con 48 h de vigencia; la comprobación de «ahora < vence» la hace el repositorio al aceptar.
export function expiraInvitacion(creadaMs: number): number {
  return creadaMs + VIGENCIA_INVITACION_MS;
}

// Enlace de la bandeja simulada (U5). El token solo existe en claro en este mensaje.
export function enlaceDeInvitacion(token: string): string {
  return `/invitacion?token=${token}`;
}
