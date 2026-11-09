import type { ChangeEvent } from 'react';
import { TERMINAL_SORT_FIELDS, TERMINAL_STATUSES, type ListTerminalsQuery } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

interface Props {
  consulta: ListTerminalsQuery;
  onCambiar: (cambio: Partial<ListTerminalsQuery>) => void;
}

// Solo deja pasar valores de la lista cerrada: lo que llega del DOM no se confía.
function opcion<T extends string>(opciones: readonly T[], valor: string): T | undefined {
  return opciones.find((candidata) => candidata === valor);
}

export default function FiltrosTerminales({ consulta, onCambiar }: Props) {
  const { t } = useI18n();

  function alCambiarBusqueda(evento: ChangeEvent<HTMLInputElement>): void {
    onCambiar({ q: evento.target.value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label={t('terminals.search')}
        data-testid={TESTIDS['terminals-search']}
        value={consulta.q ?? ''}
        onChange={alCambiarBusqueda}
        className="min-w-56 rounded border border-border bg-surface px-3 py-2"
      />
      <select
        aria-label={t('terminals.filter.status')}
        data-testid={TESTIDS['terminals-status-filter']}
        value={consulta.status ?? ''}
        onChange={(evento) => onCambiar({ status: opcion(TERMINAL_STATUSES, evento.target.value) })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="">{t('terminals.filter.all')}</option>
        {TERMINAL_STATUSES.map((estado) => (
          <option key={estado} value={estado}>
            {t(`terminals.status.${estado}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('terminals.sort')}
        data-testid={TESTIDS['terminals-sort']}
        value={consulta.sort}
        onChange={(evento) => onCambiar({ sort: opcion(TERMINAL_SORT_FIELDS, evento.target.value) ?? 'serial' })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        {TERMINAL_SORT_FIELDS.map((campo) => (
          <option key={campo} value={campo}>
            {t(`terminals.sort.${campo}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('terminals.order')}
        data-testid={TESTIDS['terminals-order']}
        value={consulta.order}
        onChange={(evento) => onCambiar({ order: evento.target.value === 'desc' ? 'desc' : 'asc' })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="asc">{t('terminals.order.asc')}</option>
        <option value="desc">{t('terminals.order.desc')}</option>
      </select>
    </div>
  );
}
