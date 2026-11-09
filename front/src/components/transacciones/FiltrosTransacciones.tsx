import { useState } from 'react';
import {
  CARD_BRANDS,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  type ListTransactionsQuery,
  type Terminal,
} from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import { finDelDia, importeValido, inicioDelDia, opcion } from './valores';

interface Props {
  consulta: ListTransactionsQuery;
  terminales: Terminal[];
  onCambiar: (cambio: Partial<ListTransactionsQuery>) => void;
}

// Un monto a medio escribir no se envía: solo cuenta si cumple el formato.
function montoFiltrado(texto: string): string | undefined {
  return importeValido(texto) ? texto : undefined;
}

export default function FiltrosTransacciones({ consulta, terminales, onCambiar }: Props) {
  const { t } = useI18n();
  // Los textos de fecha y monto se guardan aparte: el filtro efectivo solo cambia cuando el valor es válido.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [minimo, setMinimo] = useState('');
  const [maximo, setMaximo] = useState('');

  function alCambiarDesde(texto: string): void {
    setDesde(texto);
    const valor = inicioDelDia(texto);
    if (valor !== consulta.from) onCambiar({ from: valor });
  }

  function alCambiarHasta(texto: string): void {
    setHasta(texto);
    const valor = finDelDia(texto);
    if (valor !== consulta.to) onCambiar({ to: valor });
  }

  function alCambiarMinimo(texto: string): void {
    setMinimo(texto);
    const valor = montoFiltrado(texto);
    if (valor !== consulta.min) onCambiar({ min: valor });
  }

  function alCambiarMaximo(texto: string): void {
    setMaximo(texto);
    const valor = montoFiltrado(texto);
    if (valor !== consulta.max) onCambiar({ max: valor });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <select
        aria-label={t('tx.filter.status')}
        data-testid={TESTIDS['tx-filter-status']}
        value={consulta.status ?? ''}
        onChange={(evento) => onCambiar({ status: opcion(TRANSACTION_STATUSES, evento.target.value) })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="">{t('tx.filter.all')}</option>
        {TRANSACTION_STATUSES.map((estado) => (
          <option key={estado} value={estado}>
            {t(`tx.status.${estado}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('tx.filter.method')}
        data-testid={TESTIDS['tx-filter-method']}
        value={consulta.method ?? ''}
        onChange={(evento) => onCambiar({ method: opcion(PAYMENT_METHODS, evento.target.value) })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="">{t('tx.filter.all')}</option>
        {PAYMENT_METHODS.map((medio) => (
          <option key={medio} value={medio}>
            {t(`tx.method.${medio}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('tx.filter.brand')}
        data-testid={TESTIDS['tx-filter-brand']}
        value={consulta.brand ?? ''}
        onChange={(evento) => onCambiar({ brand: opcion(CARD_BRANDS, evento.target.value) })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="">{t('tx.filter.all')}</option>
        {CARD_BRANDS.map((marca) => (
          <option key={marca} value={marca}>
            {t(`tx.brand.${marca}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('tx.filter.terminal')}
        data-testid={TESTIDS['tx-filter-terminal']}
        value={consulta.terminalId ?? ''}
        onChange={(evento) => onCambiar({ terminalId: evento.target.value || undefined })}
        className="rounded border border-border bg-surface px-2 py-2"
      >
        <option value="">{t('tx.filter.all')}</option>
        {terminales.map((terminal) => (
          <option key={terminal.id} value={terminal.id}>
            {terminal.alias}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1">
        <span>{t('tx.filter.from')}</span>
        <input
          type="date"
          data-testid={TESTIDS['tx-filter-from']}
          value={desde}
          onChange={(evento) => alCambiarDesde(evento.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('tx.filter.to')}</span>
        <input
          type="date"
          data-testid={TESTIDS['tx-filter-to']}
          value={hasta}
          onChange={(evento) => alCambiarHasta(evento.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('tx.filter.min')}</span>
        <input
          inputMode="numeric"
          data-testid={TESTIDS['tx-filter-min']}
          value={minimo}
          onChange={(evento) => alCambiarMinimo(evento.target.value)}
          className="w-32 rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('tx.filter.max')}</span>
        <input
          inputMode="numeric"
          data-testid={TESTIDS['tx-filter-max']}
          value={maximo}
          onChange={(evento) => alCambiarMaximo(evento.target.value)}
          className="w-32 rounded border border-border bg-surface px-2 py-1"
        />
      </label>
    </div>
  );
}
