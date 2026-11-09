import { clavePermitida } from '../domain/password';
import { AppError } from './errors';
import { type SessionDeps, resolveSessionUser } from './get-session';
import type { AuditLog, PasswordHasher } from './ports';

export interface ChangePasswordDeps extends SessionDeps {
  hasher: PasswordHasher;
  audit: AuditLog;
}

export class ChangePassword {
  private readonly deps: ChangePasswordDeps;

  constructor(deps: ChangePasswordDeps) {
    this.deps = deps;
  }

  // Cambiar la clave cierra todas las sesiones del usuario, también la que hace la petición.
  async execute(token: string | undefined, cambio: { current: string; next: string }): Promise<void> {
    const usuario = await resolveSessionUser(this.deps, token);
    if (!clavePermitida(cambio.next) || cambio.next === cambio.current) throw new AppError('VALIDATION_ERROR');
    const correcta = await this.deps.hasher.verify(cambio.current, usuario.passwordHash);
    if (!correcta) throw new AppError('INVALID_CREDENTIALS');
    await this.deps.users.changePasswordHash(usuario.id, await this.deps.hasher.hash(cambio.next));
    await this.deps.sessions.deleteByUser(usuario.id);
    await this.deps.audit.record({
      merchantId: usuario.merchantId,
      atMs: this.deps.clock.nowMs(),
      actorId: usuario.id,
      actorName: usuario.name,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: usuario.id,
      detail: {},
    });
  }
}
