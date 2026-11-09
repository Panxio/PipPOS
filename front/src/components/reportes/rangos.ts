import { MAX_REPORT_RANGE_MS } from '@pippos/shared';
import type { RangoReporte } from '../../api/client';
import { finDelDia, inicioDelDia } from '../transacciones/valores';

export const PRESETS_REPORTE = ['today', '7d', '30d', 'month'] as const;
export type PresetReporte = (typeof PRESETS_REPORTE)[number];

// Fechas del formulario en YYYY-MM-DD, en hora local (lo que muestra un type=date).
export interface FechasReporte {
  desde: string;
  hasta: string;
}

// El constructor de Date acepta días fuera del mes (0 o -6): así se retrocede por el calendario local.
function fechaLocal(anio: number, mes: number, diaDelMes: number): string {
  const fecha = new Date(anio, mes, diaDelMes);
  const anioTexto = String(fecha.getFullYear()).padStart(4, '0');
  const mesTexto = String(fecha.getMonth() + 1).padStart(2, '0');
  const diaTexto = String(fecha.getDate()).padStart(2, '0');
  return `${anioTexto}-${mesTexto}-${diaTexto}`;
}

// Presets sobre el día local de hoy (H): hoy = H, 7 días = H−6…H, 30 días = H−29…H, mes = día 1…H.
export function fechasDePreset(preset: PresetReporte, hoy: Date): FechasReporte {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const dia = hoy.getDate();
  const hasta = fechaLocal(anio, mes, dia);
  switch (preset) {
    case 'today':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: fechaLocal(anio, mes, dia - 6), hasta };
    case '30d':
      return { desde: fechaLocal(anio, mes, dia - 29), hasta };
    case 'month':
      return { desde: fechaLocal(anio, mes, 1), hasta };
  }
}

// Rango de consulta si las fechas sirven (ambas presentes, hasta ≥ desde y como mucho 366 días); si no, null.
// La API aplica la misma regla: esto evita pedir algo que va a rechazar.
export function consultaDeFechas(fechas: FechasReporte): RangoReporte | null {
  const from = inicioDelDia(fechas.desde);
  const to = finDelDia(fechas.hasta);
  if (from === undefined || to === undefined) return null;
  if (to < from || to - from + 1 > MAX_REPORT_RANGE_MS) return null;
  return { from, to, tzOffsetMin: -new Date(from).getTimezoneOffset() };
}
