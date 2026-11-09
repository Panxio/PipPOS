import { randomBytes, randomUUID } from 'node:crypto';
import type { IdGenerator } from '../application/ports';

// Identificadores reales: UUID v4 para entidades y 32 bytes en base64url para los tokens de sesión.
export class UuidIds implements IdGenerator {
  id(): string {
    return randomUUID();
  }

  token(): string {
    return randomBytes(32).toString('base64url');
  }
}
