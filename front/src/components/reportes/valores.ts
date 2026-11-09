import type { SalesItem } from '@pippos/shared';

// Máximo de los netos como BigInt: los importes no pasan por number.
export function maximoNeto(items: readonly SalesItem[]): bigint {
  return items.reduce((mayor, item) => {
    const neto = BigInt(item.totalNet);
    return neto > mayor ? neto : mayor;
  }, 0n);
}

// Altura de una barra de 0 a 100: 100 · neto / máximo, entero truncado. Con máximo 0 todas miden 0.
export function alturaBarra(totalNet: string, maximo: bigint): number {
  if (maximo === 0n) return 0;
  return Number((BigInt(totalNet) * 100n) / maximo);
}
