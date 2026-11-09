import { REPORT_GROUP_BY, type ReportGroupBy } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import { opcion } from '../transacciones/valores';
import { PRESETS_REPORTE, type FechasReporte, type PresetReporte } from './rangos';

interface Props {
  fechas: FechasReporte;
  preset: PresetReporte | null;
  groupBy: ReportGroupBy;
  onPreset: (preset: PresetReporte) => void;
  onCambiarFecha: (campo: keyof FechasReporte, valor: string) => void;
  onCambiarGroupBy: (groupBy: ReportGroupBy) => void;
}

export default function FiltrosReportes({ fechas, preset, groupBy, onPreset, onCambiarFecha, onCambiarGroupBy }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <div role="group" aria-label={t('reports.range')} className="flex flex-wrap gap-2">
        {PRESETS_REPORTE.map((p) => (
          <button
            key={p}
            type="button"
            data-testid={TESTIDS[`report-preset-${p}` as const]}
            aria-pressed={p === preset}
            onClick={() => onPreset(p)}
            className={`rounded border border-border px-3 py-2 ${p === preset ? 'bg-accent text-surface' : 'bg-surface'}`}
          >
            {t(`reports.preset.${p}` as const)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span>{t('reports.from')}</span>
        <input
          type="date"
          data-testid={TESTIDS['report-from']}
          value={fechas.desde}
          onChange={(evento) => onCambiarFecha('desde', evento.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('reports.to')}</span>
        <input
          type="date"
          data-testid={TESTIDS['report-to']}
          value={fechas.hasta}
          onChange={(evento) => onCambiarFecha('hasta', evento.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('reports.groupBy')}</span>
        <select
          data-testid={TESTIDS['report-groupby']}
          value={groupBy}
          onChange={(evento) => {
            const elegido = opcion(REPORT_GROUP_BY, evento.target.value);
            if (elegido !== undefined) onCambiarGroupBy(elegido);
          }}
          className="rounded border border-border bg-surface px-2 py-2"
        >
          {REPORT_GROUP_BY.map((g) => (
            <option key={g} value={g}>
              {t(`reports.groupBy.${g}` as const)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
