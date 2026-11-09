import type { SessionRepository } from './ports';

export interface LogoutDeps {
  sessions: SessionRepository;
}

export class Logout {
  private readonly deps: LogoutDeps;

  constructor(deps: LogoutDeps) {
    this.deps = deps;
  }

  // Nunca falla: repetido, sin token o con token desconocido, no es error.
  async execute(token: string | undefined): Promise<void> {
    if (token) await this.deps.sessions.delete(token);
  }
}
