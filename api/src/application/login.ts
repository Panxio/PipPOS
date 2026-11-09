import type { SessionUser } from '@pippos/shared';
import { DURACION_BLOQUEO_MS, INTENTOS_PARA_BLOQUEO, estaBloqueada } from '../domain/bloqueo';
import { SESSION_TTL_MS } from '../domain/session';
import { AppError } from './errors';
import { toSessionUser } from './get-session';
import type {
  AuditLog,
  Clock,
  IdGenerator,
  PasswordHasher,
  SessionRepository,
  UserRecord,
  UserRepository,
} from './ports';

export interface LoginDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  clock: Clock;
  ids: IdGenerator;
  // Obligatoria: un inicio o un fallo se registran en la bitácora.
  audit: AuditLog;
}

export interface LoginResult {
  token: string;
  user: SessionUser;
}

export class Login {
  private readonly deps: LoginDeps;

  constructor(deps: LoginDeps) {
    this.deps = deps;
  }

  async execute(input: { email: string; password: string }): Promise<LoginResult> {
    const user = await this.deps.users.findByEmail(input.email);
    // Correo desconocido, invitado o desactivado: nunca cuentan intentos ni dan 423, y se
    // verifica igual (contra hash falso) para que el tiempo de respuesta no delate el caso.
    if (user === null || !user.active || user.passwordHash === '') {
      await this.deps.hasher.verify(input.password, null);
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (estaBloqueada(user.lockedUntilMs, this.deps.clock.nowMs())) throw new AppError('ACCOUNT_LOCKED');

    const correcta = await this.deps.hasher.verify(input.password, user.passwordHash);
    if (!correcta) {
      await this.deps.users.registerFailedLogin(user.id, {
        maxAttempts: INTENTOS_PARA_BLOQUEO,
        lockedUntilMs: this.deps.clock.nowMs() + DURACION_BLOQUEO_MS,
      });
      await this.registrar(user, 'auth.login_failed');
      throw new AppError('INVALID_CREDENTIALS');
    }

    await this.deps.users.resetFailedLogins(user.id);
    const token = this.deps.ids.token();
    await this.deps.sessions.create({
      token,
      userId: user.id,
      expiresAtMs: this.deps.clock.nowMs() + SESSION_TTL_MS,
    });
    await this.registrar(user, 'auth.login');
    return { token, user: toSessionUser(user) };
  }

  // Sin contraseña ni token en el detalle: solo quién y qué.
  private async registrar(user: UserRecord, action: 'auth.login' | 'auth.login_failed'): Promise<void> {
    await this.deps.audit.record({
      merchantId: user.merchantId,
      atMs: this.deps.clock.nowMs(),
      actorId: user.id,
      actorName: user.name,
      action,
      entityType: 'user',
      entityId: user.id,
      detail: {},
    });
  }
}
