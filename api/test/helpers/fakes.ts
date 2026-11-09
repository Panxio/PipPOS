import type {
  Clock, IdGenerator, PasswordHasher, SessionRecord, SessionRepository, UserRecord, UserRepository,
} from '../../src/application/ports';
import type { Preferences, Role } from '@pippos/shared';

export const PASSWORD = 'clave-de-prueba';
export const PREFS: Preferences = { language: 'es', theme: 'light' };

export class FakeClock implements Clock {
  private readonly inicio: number;
  constructor(public t = 1_000_000) { this.inicio = t; }
  nowMs(): number { return this.t; }
  advance(ms: number): void { this.t += ms; }
  reset(): void { this.t = this.inicio; }
}
export class FakeIds implements IdGenerator {
  private n = 0;
  private k = 0;
  id(): string { return `id-${++this.n}`; }
  token(): string { return `tok-${++this.k}`; }
}
export class FakeHasher implements PasswordHasher {
  verifyCalls = 0;
  async hash(plain: string): Promise<string> { return `h:${plain}`; }
  async verify(plain: string, hash: string | null): Promise<boolean> {
    this.verifyCalls++;
    return hash !== null && hash === `h:${plain}`;
  }
}
export function userRecord(role: Role, over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: `u-${role}`, merchantId: 'm-1', merchantName: 'Boliche La Noche', name: `Nombre ${role}`,
    email: `${role}@pippos.test`, role, passwordHash: `h:${PASSWORD}`, preferences: { ...PREFS },
    branchId: null, active: true, lockedUntilMs: 0, ...over,
  };
}
export class MemUsers implements UserRepository {
  constructor(public rows: UserRecord[] = (['admin', 'supervisor', 'cajero'] as Role[]).map((r) => userRecord(r))) {}
  async findByEmail(email: string) { return this.rows.find((u) => u.email === email) ?? null; }
  async findById(id: string) { return this.rows.find((u) => u.id === id) ?? null; }
  async findInMerchant(merchantId: string, id: string) { return this.rows.find((u) => u.merchantId === merchantId && u.id === id) ?? null; }
  async listByMerchant(merchantId: string) { return this.rows.filter((u) => u.merchantId === merchantId); }
  async savePreferences(userId: string, p: Preferences) {
    const u = this.rows.find((x) => x.id === userId);
    if (u) u.preferences = { ...p };
  }
  async insertInvited(): Promise<void> { throw new Error('no usado por application.test'); }
  async update(): Promise<void> { throw new Error('no usado por application.test'); }
  async registerFailedLogin(): Promise<void> {}
  async resetFailedLogins(): Promise<void> {}
  async changePasswordHash(): Promise<void> { throw new Error('no usado por application.test'); }
}
export class MemSessions implements SessionRepository {
  rows = new Map<string, SessionRecord>();
  finds = 0;
  deletes = 0;
  async create(s: { token: string; userId: string; expiresAtMs: number }) {
    this.rows.set(s.token, { userId: s.userId, expiresAtMs: s.expiresAtMs });
  }
  async find(token: string) { this.finds++; return this.rows.get(token) ?? null; }
  async delete(token: string) { this.deletes++; this.rows.delete(token); }
  async deleteByUser(userId: string) {
    for (const [token, s] of this.rows) if (s.userId === userId) this.rows.delete(token);
  }
}

// R5: bitácora en memoria para los casos de uso que auditan (puerto AuditLog.record).
export class MemAudit {
  entries: Array<Record<string, unknown>> = [];
  async record(entrada: Record<string, unknown>): Promise<void> { this.entries.push(entrada); }
}
