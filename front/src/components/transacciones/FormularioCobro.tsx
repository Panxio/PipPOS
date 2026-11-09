import { useState, type FormEvent } from 'react';
import {
  CARD_BRANDS,
  PAYMENT_METHODS,
  type CardBrand,
  type ErrorCode,
  type PaymentMethod,
  type Terminal,
  type Transaction,
} from '@pippos/shared';
import { codigoDe, cobrar } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import Dato from './Dato';
import { importeValido, opcion, ultimos4Validos } from './valores';

interface Borrador {
  terminalId: string;
  amount: string;
  method: PaymentMethod;
  brand: CardBrand;
  last4: string;
}

const BORRADOR_INICIAL: Borrador = { terminalId: '', amount: '', method: 'card', brand: 'visa', last4: '' };

interface Props {
  terminales: Terminal[];
  errorTerminales: ErrorCode | null;
  onCobrado: () => void;
}

export default function FormularioCobro({ terminales, errorTerminales, onCobrado }: Props) {
  const { t } = useI18n();
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_INICIAL);
  // Un requestId por intento: se reusa al reintentar sin tocar nada, y cambia al editar o al empezar otro cobro.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [resultado, setResultado] = useState<Transaction | null>(null);
  const activas = terminales.filter((terminal) => terminal.status === 'active');
  const listo = borrador.terminalId !== '' && importeValido(borrador.amount) && ultimos4Validos(borrador.last4);
  const mostrado = error ?? errorTerminales;

  function editar(cambio: Partial<Borrador>): void {
    setBorrador((actual) => ({ ...actual, ...cambio }));
    setRequestId(crypto.randomUUID());
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!listo || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const transaccion = await cobrar({
        requestId,
        terminalId: borrador.terminalId,
        amount: borrador.amount,
        method: borrador.method,
        brand: borrador.brand,
        last4: borrador.last4,
      });
      setResultado(transaccion);
      onCobrado();
    } catch (fallo) {
      setError(codigoDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  function nuevoCobro(): void {
    setBorrador(BORRADOR_INICIAL);
    setRequestId(crypto.randomUUID());
    setResultado(null);
    setError(null);
  }

  return (
    <section className="flex w-full max-w-[720px] flex-col gap-3 rounded border border-border bg-surface p-4">
      <h3 className="font-semibold">{t('charge.title')}</h3>
      {resultado !== null ? (
        <div data-testid={TESTIDS['charge-result']} className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Dato id={TESTIDS['charge-result-status']} etiqueta={t('charge.result.status')} valor={t(`tx.status.${resultado.status}` as const)} />
            <Dato id={TESTIDS['charge-result-folio']} etiqueta={t('charge.result.folio')} valor={String(resultado.folio)} />
            <Dato id={TESTIDS['charge-result-code']} etiqueta={t('charge.result.code')} valor={resultado.responseCode ?? ''} />
            <Dato id={TESTIDS['charge-result-auth']} etiqueta={t('charge.result.auth')} valor={resultado.authCode ?? ''} />
          </dl>
          <button
            type="button"
            data-testid={TESTIDS['charge-new']}
            onClick={nuevoCobro}
            className="self-start rounded border border-border bg-surface px-4 py-2"
          >
            {t('charge.new')}
          </button>
        </div>
      ) : (
        <form data-testid={TESTIDS['charge-form']} onSubmit={enviar} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>{t('charge.terminal')}</span>
            <select
              data-testid={TESTIDS['charge-terminal']}
              value={borrador.terminalId}
              onChange={(evento) => editar({ terminalId: evento.target.value })}
              className="rounded border border-border bg-surface px-2 py-2"
            >
              <option value="">{t('charge.terminal.none')}</option>
              {activas.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.alias}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t('charge.amount')}</span>
            <input
              data-testid={TESTIDS['charge-amount']}
              inputMode="numeric"
              autoComplete="off"
              value={borrador.amount}
              onChange={(evento) => editar({ amount: evento.target.value })}
              className="w-40 rounded border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t('charge.method')}</span>
            <select
              data-testid={TESTIDS['charge-method']}
              value={borrador.method}
              onChange={(evento) => editar({ method: opcion(PAYMENT_METHODS, evento.target.value) ?? 'card' })}
              className="rounded border border-border bg-surface px-2 py-2"
            >
              {PAYMENT_METHODS.map((medio) => (
                <option key={medio} value={medio}>
                  {t(`tx.method.${medio}` as const)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t('charge.brand')}</span>
            <select
              data-testid={TESTIDS['charge-brand']}
              value={borrador.brand}
              onChange={(evento) => editar({ brand: opcion(CARD_BRANDS, evento.target.value) ?? 'visa' })}
              className="rounded border border-border bg-surface px-2 py-2"
            >
              {CARD_BRANDS.map((marca) => (
                <option key={marca} value={marca}>
                  {t(`tx.brand.${marca}` as const)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t('charge.last4')}</span>
            <input
              data-testid={TESTIDS['charge-last4']}
              inputMode="numeric"
              autoComplete="off"
              value={borrador.last4}
              onChange={(evento) => editar({ last4: evento.target.value })}
              className="w-24 rounded border border-border bg-surface px-3 py-2"
            />
          </label>
          <button
            type="submit"
            data-testid={TESTIDS['charge-submit']}
            disabled={!listo || enviando}
            className="rounded bg-accent px-4 py-2 text-surface disabled:opacity-50"
          >
            {t('charge.submit')}
          </button>
          {mostrado !== null && (
            <p role="alert" data-testid={TESTIDS['charge-error']} className="w-full">
              {t(`error.${mostrado}` as const)}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
