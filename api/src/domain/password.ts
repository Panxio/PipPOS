// Política de contraseñas (U6, U9): una sola definición para la invitación y el cambio de clave.
export const LARGO_MINIMO_CLAVE = 10;
export const LARGO_MAXIMO_CLAVE = 128;

// Se cuentan caracteres (no bytes), y debe haber al menos una letra y un número.
export function clavePermitida(clave: string): boolean {
  const largo = [...clave].length;
  return largo >= LARGO_MINIMO_CLAVE && largo <= LARGO_MAXIMO_CLAVE && /\p{L}/u.test(clave) && /\d/.test(clave);
}
