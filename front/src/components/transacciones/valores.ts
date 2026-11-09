// Validaciones de entrada del front. La API valida lo mismo y es la que decide.
const IMPORTE = /^[1-9][0-9]{0,7}$/;
const ULTIMOS_4 = /^[0-9]{4}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function importeValido(texto: string): boolean {
  return IMPORTE.test(texto);
}

export function ultimos4Validos(texto: string): boolean {
  return ULTIMOS_4.test(texto);
}

// Solo deja pasar valores de una lista cerrada: lo que llega del DOM no se confía.
export function opcion<T extends string>(opciones: readonly T[], valor: string): T | undefined {
  return opciones.find((candidata) => candidata === valor);
}

// Fecha YYYY-MM-DD en hora local, en milisegundos. Sin fecha válida devuelve undefined.
function diaLocal(fecha: string, hora: number, minuto: number, segundo: number, milisegundo: number): number | undefined {
  const partes = FECHA.exec(fecha);
  if (partes === null) return undefined;
  return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), hora, minuto, segundo, milisegundo).getTime();
}

export function inicioDelDia(fecha: string): number | undefined {
  return diaLocal(fecha, 0, 0, 0, 0);
}

export function finDelDia(fecha: string): number | undefined {
  return diaLocal(fecha, 23, 59, 59, 999);
}
