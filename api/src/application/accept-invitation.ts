import { clavePermitida } from '../domain/password';
import { AppError } from './errors';
import type { Clock, InvitationRepository, PasswordHasher } from './ports';

export interface AcceptInvitationDeps {
  invitations: InvitationRepository;
  hasher: PasswordHasher;
  clock: Clock;
}

// Público y sin sesión: no inicia sesión, solo fija la contraseña y consume el token.
export class AcceptInvitation {
  private readonly deps: AcceptInvitationDeps;

  constructor(deps: AcceptInvitationDeps) {
    this.deps = deps;
  }

  async execute(token: string, password: string): Promise<void> {
    if (!clavePermitida(password)) throw new AppError('VALIDATION_ERROR');
    // El hash se calcula antes; la comprobación del token y la escritura van juntas en el repositorio.
    const passwordHash = await this.deps.hasher.hash(password);
    const aceptada = await this.deps.invitations.accept(token, this.deps.clock.nowMs(), passwordHash);
    if (!aceptada) throw new AppError('NOT_FOUND');
  }
}
