import type { Preferences, SessionUser } from '@pippos/shared';
import { type SessionDeps, resolveSessionUser, toSessionUser } from './get-session';

export class UpdatePreferences {
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, p: Preferences): Promise<SessionUser> {
    const user = await resolveSessionUser(this.deps, token);
    const preferences: Preferences = { ...p };
    await this.deps.users.savePreferences(user.id, preferences);
    return toSessionUser({ ...user, preferences });
  }
}
