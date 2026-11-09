import { useEffect, useId, useState, type FormEvent } from 'react';
import type { ErrorCode, TransactionDetail } from '@pippos/shared';
import { anularTransaccion, codigoDe, devolverTransaccion, obtenerTransaccion } from '../../api/client';
import { formatoClp } from '../../formato';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import Dato from './Dato';
import { importeValido } from './valores';

interface Props {
  id: string;
  puedeGestionar: boolean;
  aliases: ReadonlyMap<string, string>;
  onCerrar: () => void;
  onCambiado: () => void;
}

// Panel de detalle: los controles de anular y devolver solo aparecen si puedeGestionar (la API decide igual).
export default function DetalleTransaccion({ id, puedeGestionar, aliases, onCerrar, onCambiado }: Props) {
  const { t } = useI18n();
  const idTituloConfirmacion = useId();
  const [detalle, setDetalle] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [monto, setMonto] = useState('');

  useEffect(() => {
    let vigente = true;
    obtenerTransaccion(id)
      .then((encontrada) => {
        if (vigente) setDetalle(encontrada);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  // Tras una operación con éxito se recarga el detalle (con sus eventos) y el feed. Un fallo deja el detalle abierto.
  async function ejecutar(operacion: () => Promise<void>): Promise<void> {
    setOcupada(true);
    setError(null);
    try {
      await operacion();
      setDetalle(await obtenerTransaccion(id));
      onCambiado();
    } catch (fallo) {
      setError(codigoDe(fallo));
    } finally {
      setOcupada(false);
    }
  }

  function aceptarAnular(): void {
    setConfirmando(false);
    void ejecutar(() => anularTransaccion(id));
  }

  function enviarDevolucion(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (!importeValido(monto) || ocupada) return;
    const cantidad = monto;
    void ejecutar(async () => {
      await devolverTransaccion(id, { amount: cantidad });
      setMonto('');
    });
  }

  const puedeAnular = puedeGestionar && detalle !== null && detalle.status === 'approved' && detalle.refundedAmount === '0';
  const puedeDevolver =
    puedeGestionar && detalle !== null && (detalle.status === 'approved' || detalle.status === 'partially_refunded');

  return (
    <section data-testid={TESTIDS['tx-detail']} className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t('tx.detail.title')}</h3>
        <button
          type="button"
          data-testid={TESTIDS['tx-detail-close']}
          onClick={onCerrar}
          className="rounded border border-border bg-surface px-3 py-1"
        >
          {t('tx.detail.close')}
        </button>
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['tx-detail-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {detalle !== null && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Dato id={TESTIDS['tx-detail-folio']} etiqueta={t('tx.field.folio')} valor={String(detalle.folio)} />
            <Dato id={TESTIDS['tx-detail-status']} etiqueta={t('tx.field.status')} valor={t(`tx.status.${detalle.status}` as const)} />
            <Dato id={TESTIDS['tx-detail-terminal']} etiqueta={t('tx.field.terminal')} valor={aliases.get(detalle.terminalId) ?? ''} />
            <Dato id={TESTIDS['tx-detail-amount']} etiqueta={t('tx.field.amount')} valor={formatoClp(detalle.amount)} />
            <Dato id={TESTIDS['tx-detail-refunded']} etiqueta={t('tx.field.refunded')} valor={formatoClp(detalle.refundedAmount)} />
            <Dato id={TESTIDS['tx-detail-method']} etiqueta={t('tx.field.method')} valor={t(`tx.method.${detalle.method}` as const)} />
            <Dato id={TESTIDS['tx-detail-brand']} etiqueta={t('tx.field.brand')} valor={t(`tx.brand.${detalle.brand}` as const)} />
            <Dato id={TESTIDS['tx-detail-last4']} etiqueta={t('tx.field.last4')} valor={detalle.last4} />
            <Dato id={TESTIDS['tx-detail-auth']} etiqueta={t('tx.field.auth')} valor={detalle.authCode ?? ''} />
          </dl>

          <div className="flex flex-col gap-1 text-sm">
            <h4 className="font-semibold">{t('tx.detail.events')}</h4>
            <ul className="flex flex-col gap-1">
              {detalle.events.map((evento, indice) => (
                <li key={indice} data-testid={TESTIDS['tx-event']}>
                  {t(`tx.event.${evento.kind}` as const)} · {formatoClp(evento.amount)}
                </li>
              ))}
            </ul>
          </div>

          {detalle.status !== 'declined' && detalle.status !== 'timeout' && (
            <a
              data-testid={TESTIDS['tx-receipt-link']}
              href={`/comprobante/${detalle.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t('tx.detail.receipt')}
            </a>
          )}

          {puedeAnular && (
            <button
              type="button"
              data-testid={TESTIDS['tx-void']}
              disabled={ocupada}
              onClick={() => setConfirmando(true)}
              className="self-start rounded border border-border bg-surface px-4 py-2"
            >
              {t('tx.void.button')}
            </button>
          )}
          {puedeAnular && confirmando && (
            <div
              role="alertdialog"
              aria-labelledby={idTituloConfirmacion}
              data-testid={TESTIDS['tx-confirm']}
              className="flex flex-col gap-2 rounded border border-border bg-surface p-3"
            >
              <p id={idTituloConfirmacion} className="font-semibold">
                {t('tx.void.confirm.title')}
              </p>
              <p className="text-sm">{t('tx.void.confirm.text')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid={TESTIDS['tx-confirm-accept']}
                  onClick={aceptarAnular}
                  className="rounded bg-accent px-4 py-2 text-surface"
                >
                  {t('tx.void.confirm.accept')}
                </button>
                <button
                  type="button"
                  autoFocus
                  data-testid={TESTIDS['tx-confirm-cancel']}
                  onClick={() => setConfirmando(false)}
                  className="rounded border border-border bg-surface px-4 py-2"
                >
                  {t('tx.void.confirm.cancel')}
                </button>
              </div>
            </div>
          )}

          {puedeDevolver && (
            <form onSubmit={enviarDevolucion} className="flex flex-wrap items-end gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span>{t('tx.refund.amount')}</span>
                <input
                  data-testid={TESTIDS['tx-refund-amount']}
                  inputMode="numeric"
                  autoComplete="off"
                  value={monto}
                  onChange={(evento) => setMonto(evento.target.value)}
                  className="w-40 rounded border border-border bg-surface px-3 py-2"
                />
              </label>
              <button
                type="submit"
                data-testid={TESTIDS['tx-refund-submit']}
                disabled={ocupada || !importeValido(monto)}
                className="rounded bg-accent px-4 py-2 text-surface disabled:opacity-50"
              >
                {t('tx.refund.submit')}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
