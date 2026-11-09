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
const TEXTO_BASE64URL = /^[A-Za-z0-9_-]+$/;

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
export function decodificarCursor(texto: string): number | null {
  if (!TEXTO_BASE64URL.test(texto) || texto.length % 4 === 1) return null;
  const estandar = texto.replace(/-/g, '+').replace(/_/g, '/');
  const conRelleno = estandar + '='.repeat((4 - (estandar.length % 4)) % 4);
  let decimal: string;
  try {
    decimal = atob(conRelleno);
  } catch {
    return null;
  }
  if (!FOLIO_DECIMAL.test(decimal)) return null;
  const folio = Number(decimal);
  if (!Number.isSafeInteger(folio) || codificarCursor(folio) !== texto) return null;
  return folio;
}
