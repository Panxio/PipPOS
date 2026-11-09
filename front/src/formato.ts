// Importe en unidad mínima como texto ("1234567" -> "$1.234.567"). Se agrupa de a tres sin pasar por number.
export function formatoClp(texto: string): string {
  const grupos: string[] = [];
  for (let fin = texto.length; fin > 0; fin -= 3) {
    grupos.unshift(texto.slice(Math.max(0, fin - 3), fin));
  }
  return `$${grupos.join('.')}`;
}

// Puntos base como porcentaje con dos decimales y coma: 8750 -> "87,50 %". Son conteos, no dinero.
export function formatoBp(bp: number): string {
  const enteros = Math.floor(bp / 100);
  const centesimas = bp % 100;
  return `${enteros},${String(centesimas).padStart(2, '0')} %`;
}

// Variación relativa (actual − anterior) / anterior con un decimal, truncada hacia cero y en BigInt.
// Sin base de comparación (anterior 0) no hay variación: una raya.
export function formatoVariacion(actual: string, anterior: string): string {
  const base = BigInt(anterior);
  if (base === 0n) return '—';
  const decimas = ((BigInt(actual) - base) * 1000n) / base;
  if (decimas === 0n) return '0,0 %';
  const signo = decimas > 0n ? '+' : '-';
  const magnitud = decimas > 0n ? decimas : -decimas;
  return `${signo}${magnitud / 10n},${magnitud % 10n} %`;
}
