import type { ErrorCode, Transaction, TransactionPage } from '@pippos/shared';
import { formatoClp } from '../../formato';
import { useI18n } from '../../i18n';
import { TESTIDS, txOpen, txRow } from '../../testids';

interface Props {
  pagina: TransactionPage | null;
  error: ErrorCode | null;
  aliases: ReadonlyMap<string, string>;
  onAbrir: (id: string) => void;
  onIrAPagina: (page: number) => void;
}

// Feed de transacciones: la tabla se conserva si una recarga falla (el error aparece aparte).
export default function ListaTransacciones({ pagina, error, aliases, onAbrir, onIrAPagina }: Props) {
  const { t } = useI18n();
  const paginaActual = pagina?.page ?? 1;
  const paginas = pagina === null ? 1 : Math.max(1, Math.ceil(pagina.total / pagina.pageSize));

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        {t('tx.total')} <span data-testid={TESTIDS['tx-total']}>{pagina?.total ?? ''}</span>
      </p>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['tx-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && pagina === null && <p role="status" aria-busy="true" data-testid={TESTIDS['tx-loading']}>{t('tx.loading')}</p>}
      {pagina !== null && pagina.items.length === 0 && <p data-testid={TESTIDS['tx-empty']}>{t('tx.empty')}</p>}
      {pagina !== null && pagina.items.length > 0 && (
        <TablaTransacciones items={pagina.items} aliases={aliases} onAbrir={onAbrir} />
      )}
      <nav aria-label={t('pagination.label')} className="flex items-center gap-3 text-sm">
        <button
          type="button"
          data-testid={TESTIDS['tx-prev']}
          disabled={pagina === null || paginaActual <= 1}
          onClick={() => onIrAPagina(paginaActual - 1)}
          className="rounded border border-border bg-surface px-3 py-1 disabled:opacity-50"
        >
          {t('tx.prev')}
        </button>
        <span data-testid={TESTIDS['tx-page-info']}>{pagina === null ? '' : `${pagina.page} / ${paginas}`}</span>
        <button
          type="button"
          data-testid={TESTIDS['tx-next']}
          disabled={pagina === null || paginaActual >= paginas}
          onClick={() => onIrAPagina(paginaActual + 1)}
          className="rounded border border-border bg-surface px-3 py-1 disabled:opacity-50"
        >
          {t('tx.next')}
        </button>
      </nav>
    </section>
  );
}

interface TablaProps {
  items: Transaction[];
  aliases: ReadonlyMap<string, string>;
  onAbrir: (id: string) => void;
}

function TablaTransacciones({ items, aliases, onAbrir }: TablaProps) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table data-testid={TESTIDS['tx-table']} className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 font-semibold">{t('tx.col.folio')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.terminal')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.amount')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.method')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.brand')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.last4')}</th>
            <th className="px-2 py-2 font-semibold">{t('tx.col.status')}</th>
            <th className="relative">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((transaccion) => (
            <tr key={transaccion.id} data-testid={txRow(transaccion.folio)} className="border-b border-border">
              <td className="cifra px-2 py-2">{transaccion.folio}</td>
              <td className="px-2 py-2">{aliases.get(transaccion.terminalId) ?? ''}</td>
              <td className="cifra px-2 py-2">{formatoClp(transaccion.amount)}</td>
              <td className="px-2 py-2">{t(`tx.method.${transaccion.method}` as const)}</td>
              <td className="px-2 py-2">{t(`tx.brand.${transaccion.brand}` as const)}</td>
              <td className="cifra px-2 py-2">{transaccion.last4}</td>
              <td className="px-2 py-2">{t(`tx.status.${transaccion.status}` as const)}</td>
              <td className="px-2 py-2">
                <button
                  type="button"
                  data-testid={txOpen(transaccion.folio)}
                  onClick={() => onAbrir(transaccion.id)}
                  className="rounded border border-border bg-surface px-3 py-1"
                >
                  {t('tx.open')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
