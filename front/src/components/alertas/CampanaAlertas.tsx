import { useState } from 'react';
import type { AlertList, ErrorCode } from '@pippos/shared';
import { codigoDe, marcarAlertaLeida, marcarTodasLeidas } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS, alertItem, alertRead } from '../../testids';
import { textoDeAlerta } from './textos';
import type { EstadoAlertas } from './useEstadoAlertas';

interface Props {
  estado: EstadoAlertas;
  onVerTodas: () => void;
}

// Campana de la barra: el badge cuenta las no leídas y el desplegable lista las últimas alertas.
export default function CampanaAlertas({ estado, onVerTodas }: Props) {
  const { t } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [errorAccion, setErrorAccion] = useState<ErrorCode | null>(null);
  const { lista, error, avisarCambio } = estado;
  const noLeidas = lista?.unreadCount ?? 0;
  const mostrarBadge = error === null && noLeidas > 0;

  // Marcar (una o todas) y luego volver a pedir: el badge baja con lo que responde la API.
  async function marcar(accion: () => Promise<void>): Promise<void> {
    setErrorAccion(null);
    try {
      await accion();
      avisarCambio();
    } catch (fallo: unknown) {
      setErrorAccion(codigoDe(fallo));
    }
  }

  function verTodas(): void {
    setAbierto(false);
    onVerTodas();
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid={TESTIDS['alerts-bell']}
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1"
      >
        {t('alerts.bell')}
        {mostrarBadge && (
          <span data-testid={TESTIDS['alerts-badge']} className="rounded bg-accent px-1.5 text-surface">
            {noLeidas}
          </span>
        )}
      </button>
      {abierto && (
        <div
          data-testid={TESTIDS['alerts-panel']}
          className="absolute right-0 z-10 mt-2 flex w-96 flex-col gap-3 rounded border border-border bg-surface p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('alerts.panel.title')}</h2>
            <button
              type="button"
              data-testid={TESTIDS['alerts-read-all']}
              disabled={noLeidas === 0}
              onClick={() => void marcar(marcarTodasLeidas)}
              className="text-accent underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t('alerts.readAll')}
            </button>
          </div>
          <ContenidoPanel lista={lista} error={error} errorAccion={errorAccion} onMarcar={marcar} />
          <button
            type="button"
            data-testid={TESTIDS['alerts-view-all']}
            onClick={verTodas}
            className="self-end text-accent underline-offset-4 hover:underline"
          >
            {t('alerts.viewAll')}
          </button>
        </div>
      )}
    </div>
  );
}

interface ContenidoProps {
  lista: AlertList | null;
  error: ErrorCode | null;
  errorAccion: ErrorCode | null;
  onMarcar: (accion: () => Promise<void>) => Promise<void>;
}

// Un fallo de la lista oculta los ítems; un fallo al marcar aparece encima y la lista sigue.
function ContenidoPanel({ lista, error, errorAccion, onMarcar }: ContenidoProps) {
  const { t } = useI18n();
  const mensaje = error ?? errorAccion;
  return (
    <>
      {mensaje !== null && (
        <p role="alert" data-testid={TESTIDS['alerts-panel-error']}>
          {t(`error.${mensaje}` as const)}
        </p>
      )}
      {error === null && lista === null && <p role="status" aria-busy="true" data-testid={TESTIDS['alerts-panel-loading']}>{t('alerts.loading')}</p>}
      {error === null && lista !== null && lista.items.length === 0 && (
        <p data-testid={TESTIDS['alerts-panel-empty']}>{t('alerts.panel.empty')}</p>
      )}
      {error === null && lista !== null && lista.items.length > 0 && (
        <ul className="flex max-h-96 flex-col overflow-y-auto">
          {lista.items.map((alerta) => (
            <li
              key={alerta.id}
              data-testid={alertItem(alerta.id)}
              data-read={String(alerta.read)}
              className="flex items-start justify-between gap-2 border-b border-border py-2"
            >
              <span>
                {textoDeAlerta(alerta, t)}
                {alerta.resolvedAt !== null && <span className="ml-2 text-accent">{t('alerts.resolved')}</span>}
              </span>
              {!alerta.read && (
                <button
                  type="button"
                  data-testid={alertRead(alerta.id)}
                  onClick={() => void onMarcar(() => marcarAlertaLeida(alerta.id))}
                  className="shrink-0 text-accent underline-offset-4 hover:underline"
                >
                  {t('alerts.read')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
