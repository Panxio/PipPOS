import type { ReactNode } from 'react';
import type { ReportKpis, SummaryResponse } from '@pippos/shared';
import { formatoBp, formatoClp, formatoVariacion } from '../../formato';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

type IdTarjeta = 'total' | 'sales' | 'avg' | 'attempts' | 'approval' | 'voided';

interface Props {
  resumen: SummaryResponse;
}

// Tarjetas del resumen. La variación solo aparece si la API trae el período anterior.
export default function TarjetasKpi({ resumen }: Props) {
  const { t } = useI18n();
  const { kpis } = resumen;
  const anterior = resumen.previous?.kpis;
  const variacion = (actual: string, pasado: (k: ReportKpis) => string): string | undefined =>
    anterior === undefined ? undefined : formatoVariacion(actual, pasado(anterior));

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Tarjeta
        id="total"
        etiqueta={t('reports.kpi.total')}
        valor={formatoClp(kpis.totalNet)}
        variacion={variacion(kpis.totalNet, (k) => k.totalNet)}
      />
      <Tarjeta
        id="sales"
        etiqueta={t('reports.kpi.sales')}
        valor={String(kpis.sales)}
        variacion={variacion(String(kpis.sales), (k) => String(k.sales))}
      />
      <Tarjeta
        id="avg"
        etiqueta={t('reports.kpi.avg')}
        valor={formatoClp(kpis.avgTicket)}
        variacion={variacion(kpis.avgTicket, (k) => k.avgTicket)}
      />
      <Tarjeta
        id="attempts"
        etiqueta={t('reports.kpi.attempts')}
        valor={String(kpis.attempts)}
        variacion={variacion(String(kpis.attempts), (k) => String(k.attempts))}
      />
      <Tarjeta
        id="approval"
        etiqueta={t('reports.kpi.approval')}
        valor={formatoBp(kpis.approvalBp)}
        variacion={variacion(String(kpis.approvalBp), (k) => String(k.approvalBp))}
      />
      <Tarjeta
        id="voided"
        etiqueta={t('reports.kpi.voided')}
        valor={String(kpis.voidedCount)}
        variacion={variacion(String(kpis.voidedCount), (k) => String(k.voidedCount))}
      >
        <span>
          {t('reports.kpi.voidedAmount')}:{' '}
          <span data-testid={TESTIDS['kpi-voided-amount']}>{formatoClp(kpis.voidedAmount)}</span>
        </span>
      </Tarjeta>
    </div>
  );
}

interface TarjetaProps {
  id: IdTarjeta;
  etiqueta: string;
  valor: string;
  variacion?: string;
  children?: ReactNode;
}

function Tarjeta({ id, etiqueta, valor, variacion, children }: TarjetaProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3">
      <span className="text-sm">{etiqueta}</span>
      <span data-testid={TESTIDS[`kpi-${id}-value` as const]} className="cifra text-2xl font-semibold">
        {valor}
      </span>
      {variacion !== undefined && (
        <span data-testid={TESTIDS[`kpi-${id}-delta` as const]} className="text-sm">
          {variacion}
        </span>
      )}
      {children}
    </div>
  );
}
