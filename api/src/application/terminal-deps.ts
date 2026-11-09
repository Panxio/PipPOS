import type { Role } from '@pippos/shared';
import { AppError } from './errors';
import { type Acceso, type SessionDeps, resolveSessionUser } from './get-session';
import type { AuditLog, IdGenerator, TerminalRepository, UserRecord } from './ports';

export interface TerminalDeps extends SessionDeps {
  terminals: TerminalRepository;
  ids: IdGenerator;
  audit: AuditLog;
}

// Resuelve la sesión y exige el permiso. El comercio sale del usuario, nunca de la petición.
export async function usuarioQue(
  deps: SessionDeps,
  acceso: Acceso,
  permiso: (rol: Role) => boolean,
): Promise<UserRecord> {
  const usuario = await resolveSessionUser(deps, acceso);
  if (!permiso(usuario.role)) throw new AppError('FORBIDDEN');
  return usuario;
}
