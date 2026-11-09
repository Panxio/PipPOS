import type { ReportGroupBy, SalesResponse } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import GraficoVentas from './GraficoVentas';
import TablaVentas from './TablaVentas';

// El gráfico solo tiene sentido en el tiempo: día y hora.
const AGRUPADOS_CON_GRAFICO: readonly ReportGroupBy[] = ['day', 'hour'];

interface Props {
  ventas: SalesResponse;
}

// Lo que muestra un resultado de ventas: el aviso si no hay ninguna venta; si no, gráfico (día u hora) y tabla.
export default function VistaVentas({ ventas }: Props) {
  const { t } = useI18n();
  if (ventas.items.every((item) => item.sales === 0)) {
    return <p data-testid={TESTIDS['report-empty']}>{t('reports.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {AGRUPADOS_CON_GRAFICO.includes(ventas.groupBy) && <GraficoVentas items={ventas.items} />}
      <TablaVentas groupBy={ventas.groupBy} items={ventas.items} />
    </div>
  );
}
