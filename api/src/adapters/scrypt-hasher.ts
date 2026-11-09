import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../application/ports';

// Formato del hash: scrypt$<sal base64url>$<clave base64url>. Los parámetros viven en el código.
const PREFIJO = 'scrypt';
const COSTE = { N: 16384, r: 8, p: 1 };
const LONG_SAL = 16;
const LONG_CLAVE = 64;
// Sal fija para el caso sin hash: gasta lo mismo que una verificación real.
const SAL_FALSA = Buffer.alloc(LONG_SAL);

interface HashPartido {
  sal: Buffer;
  clave: Buffer;
}

function derive(plano: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plano, sal, LONG_CLAVE, COSTE, (error, clave) => (error ? reject(error) : resolve(clave)));
  });
}

function parseHash(hash: string): HashPartido | null {
  const partes = hash.split('$');
  if (partes.length !== 3 || partes[0] !== PREFIJO) return null;
  const sal = Buffer.from(partes[1], 'base64url');
  const clave = Buffer.from(partes[2], 'base64url');
  return sal.length === LONG_SAL && clave.length === LONG_CLAVE ? { sal, clave } : null;
}

export class ScryptHasher implements PasswordHasher {
  async hash(plano: string): Promise<string> {
    const sal = randomBytes(LONG_SAL);
    const clave = await derive(plano, sal);
    return [PREFIJO, sal.toString('base64url'), clave.toString('base64url')].join('$');
  }

  // Con hash null o corrupto calcula igual y devuelve false: no lanza y no revela si el usuario existe.
  async verify(plano: string, hash: string | null): Promise<boolean> {
    const partido = hash === null ? null : parseHash(hash);
    if (partido === null) {
      await derive(plano, SAL_FALSA);
      return false;
    }
    const clave = await derive(plano, partido.sal);
    return timingSafeEqual(clave, partido.clave);
  }
}
