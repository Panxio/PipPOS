import type { Alert } from '@pippos/shared';
import { formatoClp } from '../../formato';
import type { MessageKey } from '../../i18n';

// La API manda tipo y parámetros; el texto sale del catálogo del idioma activo. El importe va con formato de pesos.
export function textoDeAlerta(alerta: Alert, t: (clave: MessageKey) => string): string {
  const parametros = alerta.params;
  const valores: Record<string, string> = {
    alias: String(parametros.alias ?? ''),
    batteryPct: String(parametros.batteryPct ?? ''),
    folio: String(parametros.folio ?? ''),
    amount: parametros.amount === undefined ? '' : formatoClp(String(parametros.amount)),
  };
  return t(`alerts.type.${alerta.type}` as const).replace(/\{(\w+)\}/g, (_, nombre: string) => valores[nombre] ?? '');
}
