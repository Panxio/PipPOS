import type { ApiKeyScope } from '@pippos/shared';

// Llave de la API pública: «pip_» seguido del token. Después de crearla solo se muestra su prefijo (8 caracteres).
const PREFIJO_LLAVE = 'pip_';
const LARGO_PREFIJO = 8;

// Read solo lee; write lee y cobra. Anular, devolver, usuarios y llaves no existen en la API pública.
const METODOS_POR_ALCANCE: Readonly<Record<ApiKeyScope, readonly string[]>> = {
  read: ['GET'],
  write: ['GET', 'POST'],
};

// Folio positivo y canónico: sin ceros a la izquierda, sin signo, sin decimales.
const FOLIO_DECIMAL = /^[1-9][0-9]{0,15}$/;

export function formatoLlave(token: string): string {
  return `${PREFIJO_LLAVE}${token}`;
}

export function prefijoDe(llave: string): string {
  return llave.slice(0, LARGO_PREFIJO);
}

export function alcancePermite(alcance: ApiKeyScope, metodo: string): boolean {
  return (METODOS_POR_ALCANCE[alcance] ?? []).includes(metodo);
}

// El cursor es el folio como texto decimal, en base64url sin relleno. Es opaco para el cliente.
export function codificarCursor(folio: number): string {
  return btoa(String(folio)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Devuelve el folio, o null si el texto no es un cursor canónico (no basta con que decodifique).
// Un cursor válido solo tiene letras y dígitos (los folios son dígitos: su base64 nunca usa «+», «/», «-» ni «_»),
// así que no hace falta mapear base64url: cualquier otro carácter hace fallar a atob o a la re-codificación final.
// `atob` acepta el texto sin relleno y descarta bits sobrantes; por eso se compara con la codificación canónica.
export function decodificarCursor(texto: string): number | null {
  let decimal: string;
  try {
    decimal = atob(texto);
  } catch {
    return null;
  }
  if (!FOLIO_DECIMAL.test(decimal)) return null;
  const folio = Number(decimal);
  if (!Number.isSafeInteger(folio) || codificarCursor(folio) !== texto) return null;
  return folio;
}
