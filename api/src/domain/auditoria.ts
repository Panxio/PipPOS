import { celdaCsv } from './reporte';

// Bitácora: forma de una fila y su exportación a CSV.
export interface FilaAuditoria {
  seq: number;
  atMs: number;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, string>;
}

const CABECERA = 'seq,atMs,actorId,actorName,action,entityType,entityId,detail';

// RFC 4180 con \r\n tras cada línea, cabecera incluida. Los textos pasan por la misma celda que los reportes (antídoto de inyección).
export function auditoriaACsv(filas: readonly FilaAuditoria[]): string {
  const lineas = [CABECERA, ...filas.map(aLinea)];
  return lineas.map((linea) => `${linea}\r\n`).join('');
}

function aLinea(fila: FilaAuditoria): string {
  return [
    String(fila.seq),
    String(fila.atMs),
    celdaCsv(fila.actorId ?? ''),
    celdaCsv(fila.actorName),
    celdaCsv(fila.action),
    celdaCsv(fila.entityType),
    celdaCsv(fila.entityId ?? ''),
    celdaCsv(JSON.stringify(fila.detail)),
  ].join(',');
}
