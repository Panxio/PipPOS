import { IMPORTE, type AlertSettings } from '@pippos/shared';

// Batería: entero de 1 a 99, sin ceros a la izquierda. El importe usa la misma regla que la API (IMPORTE de shared).
const BATERIA = /^[1-9][0-9]?$/;

// Umbrales listos para enviar, o null si algún campo no vale. La API valida lo mismo y es la que decide.
export function umbralesValidos(bateria: string, importe: string): AlertSettings | null {
  if (!BATERIA.test(bateria) || !IMPORTE.test(importe)) return null;
  return { batteryBelowPct: Number(bateria), voidAtLeastAmount: importe };
}
