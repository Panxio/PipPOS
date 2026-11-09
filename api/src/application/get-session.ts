import type { SessionUser } from '@pippos/shared';
import { sectionsFor } from '../domain/access';
import { isSessionActive } from '../domain/session';
import { AppError } from './errors';
import type { Clock, SessionRepository, UserRecord, UserRepository } from './ports';

// Quién pide algo: el token de la cookie de sesión, o el usuario efectivo de una llave de la API pública
// ya autenticada (su creador, con rol supervisor). Los casos de uso no necesitan saber de dónde viene.
export type Acceso = string | UserRecord | undefined;

export interface SessionDeps {
  users: UserRepository;
  sessions: SessionRepository;
  clock: Clock;
}

export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    merchantName: user.merchantName,
    sections: [...sectionsFor(user.role)],
    preferences: { ...user.preferences },
  };
}

// Resuelve el usuario de un token vigente; cualquier otro caso es UNAUTHENTICATED.
// Un usuario ya resuelto (llave de la API pública) se devuelve tal cual: su autenticación ya se comprobó.
export async function resolveSessionUser(deps: SessionDeps, acceso: Acceso): Promise<UserRecord> {
  if (typeof acceso === 'object') return acceso;
  if (!acceso) throw new AppError('UNAUTHENTICATED');
  const session = await deps.sessions.find(acceso);
  if (!session || !isSessionActive(session.expiresAtMs, deps.clock.nowMs())) {
    throw new AppError('UNAUTHENTICATED');
  }
  // El usuario se lee de la BD en cada petición: un cambio de rol o de estado rige al momento.
  const user = await deps.users.findById(session.userId);
  if (!user || !user.active) throw new AppError('UNAUTHENTICATED');
  return user;
}

export class GetSession {
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined): Promise<SessionUser> {
    return toSessionUser(await resolveSessionUser(this.deps, token));
  }
}
