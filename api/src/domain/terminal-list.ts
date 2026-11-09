import type { ListTerminalsQuery, Terminal, TerminalPage } from '@pippos/shared';

// Filtro, orden y página sobre los terminales de un comercio (ya filtrados por comercio).
// Búsqueda y orden sin distinguir mayúsculas en serial y alias; desempate por serial.
export function consultarTerminales(todas: readonly Terminal[], consulta: ListTerminalsQuery): TerminalPage {
  const filtradas = todas.filter((t) => coincide(t, consulta)).sort((a, b) => comparar(a, b, consulta));
  const inicio = (consulta.page - 1) * consulta.pageSize;
  return {
    items: filtradas.slice(inicio, inicio + consulta.pageSize),
    total: filtradas.length,
    page: consulta.page,
    pageSize: consulta.pageSize,
  };
}

function coincide(t: Terminal, consulta: ListTerminalsQuery): boolean {
  if (consulta.status !== undefined && t.status !== consulta.status) return false;
  const buscado = (consulta.q ?? '').toLowerCase();
  return t.serial.toLowerCase().includes(buscado) || t.alias.toLowerCase().includes(buscado);
}

function comparar(a: Terminal, b: Terminal, consulta: ListTerminalsQuery): number {
  const sentido = consulta.order === 'asc' ? 1 : -1;
  const campo = consulta.sort;
  const principal = campo === 'createdAt' ? a.createdAt - b.createdAt : comparaTexto(a[campo], b[campo]);
  return (principal || comparaTexto(a.serial, b.serial)) * sentido;
}

function comparaTexto(x: string, y: string): number {
  return x.localeCompare(y, 'es', { sensitivity: 'base' });
}
