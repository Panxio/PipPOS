import { useEffect, useState } from 'react';
import type { AlertList, ErrorCode } from '@pippos/shared';
import { codigoDe, marcarAlertaLeida, obtenerAlertas } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS, alertRow, alertRowRead } from '../../testids';
import { textoDeAlerta } from './textos';

const LIMITE_SECCION = 50;

interface Props {
  // Sube cuando cambia algo fuera de esta lista (marcar aquí o desde la campana): la lista se vuelve a pedir.
  version: number;
  onCambio: () => void;
}

export default function PestanaAlertas({ version, onCambio }: Props) {
  const { t, lang } = useI18n();
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [lista, setLista] = useState<AlertList | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [errorAccion, setErrorAccion] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let vigente = true;
    setError(null);
    obtenerAlertas({ limit: LIMITE_SECCION, unread: soloNoLeidas })
      .then((respuesta) => {
        if (vigente) setLista(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [soloNoLeidas, version]);

  async function marcar(accion: () => Promise<void>): Promise<void> {
    setErrorAccion(null);
    try {
      await accion();
      onCambio();
    } catch (fallo: unknown) {
      setErrorAccion(codigoDe(fallo));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid={TESTIDS['alerts-unread-only']}
          checked={soloNoLeidas}
          onChange={(evento) => setSoloNoLeidas(evento.target.checked)}
        />
        {t('alerts.unreadOnly')}
      </label>
      {errorAccion !== null && (
        <p role="alert" data-testid={TESTIDS['alerts-action-error']}>
          {t(`error.${errorAccion}` as const)}
        </p>
      )}
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['alerts-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && lista === null && <p>{t('alerts.loading')}</p>}
      {error === null && lista !== null && lista.items.length === 0 && (
        <p data-testid={TESTIDS['alerts-empty']}>{t('alerts.empty')}</p>
      )}
      {error === null && lista !== null && lista.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-semibold">{t('alerts.col.date')}</th>
                <th className="px-2 py-2 font-semibold">{t('alerts.col.alert')}</th>
                <th className="px-2 py-2 font-semibold">{t('alerts.col.status')}</th>
                <th className="relative">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.items.map((alerta) => (
                <tr key={alerta.id} data-testid={alertRow(alerta.id)} data-read={String(alerta.read)} className="border-b border-border">
                  <td className="px-2 py-2">{new Date(alerta.createdAt).toLocaleString(lang)}</td>
                  <td className="px-2 py-2">
                    {textoDeAlerta(alerta, t)}
                    {alerta.resolvedAt !== null && <span className="ml-2 text-accent">{t('alerts.resolved')}</span>}
                  </td>
                  <td className="px-2 py-2">{t(alerta.read ? 'alerts.status.read' : 'alerts.status.unread')}</td>
                  <td className="px-2 py-2">
                    {!alerta.read && (
                      <button
                        type="button"
                        data-testid={alertRowRead(alerta.id)}
                        onClick={() => void marcar(() => marcarAlertaLeida(alerta.id))}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {t('alerts.read')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
