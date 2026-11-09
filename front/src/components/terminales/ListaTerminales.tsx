import type { ErrorCode, Terminal, TerminalPage } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS, terminalOpen, terminalRow } from '../../testids';

interface Props {
  pagina: TerminalPage | null;
  error: ErrorCode | null;
  onAbrir: (id: string) => void;
  onIrAPagina: (page: number) => void;
}

export default function ListaTerminales({ pagina, error, onAbrir, onIrAPagina }: Props) {
  const { t } = useI18n();
  const paginaActual = pagina?.page ?? 1;
  const paginas = pagina === null ? 1 : Math.max(1, Math.ceil(pagina.total / pagina.pageSize));

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        {t('terminals.total')} <span data-testid={TESTIDS['terminals-total']}>{pagina?.total ?? ''}</span>
      </p>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['terminals-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && pagina === null && <p>{t('terminals.loading')}</p>}
      {pagina !== null && pagina.items.length === 0 && (
        <p data-testid={TESTIDS['terminals-empty']}>{t('terminals.empty')}</p>
      )}
      {pagina !== null && pagina.items.length > 0 && <TablaTerminales items={pagina.items} onAbrir={onAbrir} />}
      <nav aria-label={t('pagination.label')} className="flex items-center gap-3 text-sm">
        <button
          type="button"
          data-testid={TESTIDS['terminals-prev']}
          disabled={pagina === null || paginaActual <= 1}
          onClick={() => onIrAPagina(paginaActual - 1)}
          className="rounded border border-border bg-surface px-3 py-1 disabled:opacity-50"
        >
          {t('terminals.prev')}
        </button>
        <span data-testid={TESTIDS['terminals-page-info']}>{pagina === null ? '' : `${pagina.page} / ${paginas}`}</span>
        <button
          type="button"
          data-testid={TESTIDS['terminals-next']}
          disabled={pagina === null || paginaActual >= paginas}
          onClick={() => onIrAPagina(paginaActual + 1)}
          className="rounded border border-border bg-surface px-3 py-1 disabled:opacity-50"
        >
          {t('terminals.next')}
        </button>
      </nav>
    </section>
  );
}

interface TablaProps {
  items: Terminal[];
  onAbrir: (id: string) => void;
}

function TablaTerminales({ items, onAbrir }: TablaProps) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table data-testid={TESTIDS['terminals-table']} className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 font-semibold">{t('terminals.col.serial')}</th>
            <th className="px-2 py-2 font-semibold">{t('terminals.col.alias')}</th>
            <th className="px-2 py-2 font-semibold">{t('terminals.col.branch')}</th>
            <th className="px-2 py-2 font-semibold">{t('terminals.col.status')}</th>
            <th className="relative">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((terminal) => (
            <tr key={terminal.id} data-testid={terminalRow(terminal.serial)} className="border-b border-border">
              <td className="cifra px-2 py-2">{terminal.serial}</td>
              <td className="px-2 py-2">{terminal.alias}</td>
              <td className="px-2 py-2">{terminal.branch}</td>
              <td className="px-2 py-2">{t(`terminals.status.${terminal.status}` as const)}</td>
              <td className="px-2 py-2">
                <button
                  type="button"
                  data-testid={terminalOpen(terminal.serial)}
                  onClick={() => onAbrir(terminal.id)}
                  className="rounded border border-border bg-surface px-3 py-1"
                >
                  {t('terminals.open')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
