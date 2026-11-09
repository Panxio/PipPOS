// Bloqueo por intentos fallidos (U10, propuesta de la spec).
export const INTENTOS_PARA_BLOQUEO = 3;
export const DURACION_BLOQUEO_MS = 15 * 60 * 1000;

// Bloqueada mientras ahora < hasta; en el instante exacto del vencimiento ya no lo está.
export function estaBloqueada(bloqueadaHastaMs: number, ahoraMs: number): boolean {
  return ahoraMs < bloqueadaHastaMs;
}
