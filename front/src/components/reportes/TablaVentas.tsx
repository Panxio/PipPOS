import { CARD_BRANDS, PAYMENT_METHODS, type ReportGroupBy, type SalesItem } from '@pippos/shared';
import { formatoClp } from '../../formato';
import { useI18n, type MessageKey } from '../../i18n';
import { TESTIDS, reportRow } from '../../testids';
import { opcion } from '../transacciones/valores';

interface Props {
  groupBy: ReportGroupBy;
  items: SalesItem[];
}

// Fecha u hora: la clave ya es legible. Terminal y cajero: el alias o nombre, o la clave si viene vacío.
// Medio y marca: el enum traducido; si llega algo desconocido, la etiqueta de la API.
function etiquetaDe(item: SalesItem, groupBy: ReportGroupBy, t: (clave: MessageKey) => string): string {
  switch (groupBy) {
    case 'day':
    case 'hour':
      return item.key;
    case 'terminal':
    case 'cashier':
      return item.label === '' ? item.key : item.label;
    case 'method': {
      const medio = opcion(PAYMENT_METHODS, item.key);
      return medio === undefined ? item.label : t(`tx.method.${medio}` as const);
    }
    case 'brand': {
      const marca = opcion(CARD_BRANDS, item.key);
      return marca === undefined ? item.label : t(`tx.brand.${marca}` as const);
    }
  }
}

// Tabla del agrupado: tres celdas por fila (etiqueta, ventas, importe neto).
export default function TablaVentas({ groupBy, items }: Props) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table data-testid={TESTIDS['report-table']} className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-2 py-2 font-semibold">
              {t('reports.col.group')}
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              {t('reports.col.sales')}
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              {t('reports.col.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} data-testid={reportRow(item.key)} className="border-b border-border">
              <th scope="row" className="px-2 py-2 font-normal">
                {etiquetaDe(item, groupBy, t)}
              </th>
              <td className="px-2 py-2">{item.sales}</td>
              <td className="px-2 py-2">{formatoClp(item.totalNet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
