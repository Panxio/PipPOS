import { useEffect, useState } from 'react';
import type { ErrorCode, Receipt } from '@pippos/shared';
import { codigoDe, obtenerComprobante } from '../api/client';
import Dato from '../components/transacciones/Dato';
import { formatoClp } from '../formato';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  id: string;
}

// Ruta pública /comprobante/:id: se ve con o sin sesión de la app (la cookie viaja sola). Sin barra de la app.
export default function ReceiptPage({ id }: Props) {
  const { t, lang } = useI18n();
  const [comprobante, setComprobante] = useState<Receipt | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerComprobante(id)
      .then((recibo) => {
        if (vigente) setComprobante(recibo);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  return (
    <main data-testid={TESTIDS['receipt-page']} className="mx-auto mt-8 flex max-w-md flex-col gap-4 p-4">
      <p className="text-sm font-semibold">{t('app.title')}</p>
      <h1 className="text-xl font-semibold">{t('receipt.title')}</h1>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['receipt-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {comprobante !== null && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Dato id={TESTIDS['receipt-folio']} etiqueta={t('tx.field.folio')} valor={String(comprobante.folio)} />
            <Dato id={TESTIDS['receipt-merchant']} etiqueta={t('receipt.merchant')} valor={comprobante.merchantName} />
            <Dato id={TESTIDS['receipt-terminal']} etiqueta={t('tx.field.terminal')} valor={comprobante.terminalAlias} />
            <Dato id={TESTIDS['receipt-amount']} etiqueta={t('tx.field.amount')} valor={formatoClp(comprobante.amount)} />
            <Dato id={TESTIDS['receipt-refunded']} etiqueta={t('tx.field.refunded')} valor={formatoClp(comprobante.refundedAmount)} />
            <Dato id={TESTIDS['receipt-method']} etiqueta={t('tx.field.method')} valor={t(`tx.method.${comprobante.method}` as const)} />
            <Dato id={TESTIDS['receipt-brand']} etiqueta={t('tx.field.brand')} valor={t(`tx.brand.${comprobante.brand}` as const)} />
            <Dato id={TESTIDS['receipt-last4']} etiqueta={t('tx.field.last4')} valor={comprobante.last4} />
            <Dato id={TESTIDS['receipt-status']} etiqueta={t('tx.field.status')} valor={t(`tx.status.${comprobante.status}` as const)} />
            <Dato id={TESTIDS['receipt-auth']} etiqueta={t('tx.field.auth')} valor={comprobante.authCode ?? ''} />
            <Dato id={TESTIDS['receipt-date']} etiqueta={t('tx.field.date')} valor={new Date(comprobante.createdAt).toLocaleString(lang)} />
          </dl>
          <button
            type="button"
            data-testid={TESTIDS['receipt-print']}
            onClick={() => window.print()}
            className="self-start rounded border border-border bg-surface px-4 py-2"
          >
            {t('receipt.print')}
          </button>
        </>
      )}
    </main>
  );
}
